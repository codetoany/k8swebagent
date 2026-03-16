package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditStatus string

const (
	AuditStatusSuccess AuditStatus = "success"
	AuditStatusFailed  AuditStatus = "failed"
)

type AuditLogEntry struct {
	ID           string          `json:"id"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resourceType"`
	ResourceName string          `json:"resourceName"`
	Namespace    string          `json:"namespace,omitempty"`
	ClusterID    string          `json:"clusterId,omitempty"`
	ClusterName  string          `json:"clusterName,omitempty"`
	Status       AuditStatus     `json:"status"`
	Message      string          `json:"message"`
	ActorName    string          `json:"actorName"`
	ActorEmail   string          `json:"actorEmail"`
	Details      json.RawMessage `json:"details,omitempty"`
	CreatedAt    time.Time       `json:"createdAt"`
}

type AuditLogInput struct {
	Action       string
	ResourceType string
	ResourceName string
	Namespace    string
	ClusterID    string
	ClusterName  string
	Status       AuditStatus
	Message      string
	ActorName    string
	ActorEmail   string
	Details      any
}

type AuditLogFilter struct {
	ClusterID    string
	Status       AuditStatus
	Action       string
	ResourceType string
	ResourceName string
	Namespace    string
	Query        string
	Page         int
	PageSize     int
}

type AuditLogListResult struct {
	Items    []AuditLogEntry `json:"items"`
	Total    int             `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"pageSize"`
}

type AuditStore struct {
	pool *pgxpool.Pool
}

func NewAuditStore(pool *pgxpool.Pool) *AuditStore {
	return &AuditStore{pool: pool}
}

func (s *AuditStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS audit_logs (
			id TEXT PRIMARY KEY,
			action TEXT NOT NULL,
			resource_type TEXT NOT NULL,
			resource_name TEXT NOT NULL DEFAULT '',
			namespace TEXT NOT NULL DEFAULT '',
			cluster_id TEXT NOT NULL DEFAULT '',
			cluster_name TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			message TEXT NOT NULL DEFAULT '',
			actor_name TEXT NOT NULL DEFAULT '',
			actor_email TEXT NOT NULL DEFAULT '',
			details JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

func (s *AuditStore) Record(ctx context.Context, input AuditLogInput) error {
	details, err := marshalAuditDetails(input.Details)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO audit_logs (
			id,
			action,
			resource_type,
			resource_name,
			namespace,
			cluster_id,
			cluster_name,
			status,
			message,
			actor_name,
			actor_email,
			details
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
		)
	`,
		newAuditID(),
		strings.TrimSpace(input.Action),
		strings.TrimSpace(input.ResourceType),
		strings.TrimSpace(input.ResourceName),
		strings.TrimSpace(input.Namespace),
		strings.TrimSpace(input.ClusterID),
		strings.TrimSpace(input.ClusterName),
		string(input.Status),
		strings.TrimSpace(input.Message),
		strings.TrimSpace(input.ActorName),
		strings.TrimSpace(input.ActorEmail),
		string(details),
	)

	return err
}

func (s *AuditStore) List(ctx context.Context, filter AuditLogFilter) (*AuditLogListResult, error) {
	page := filter.Page
	if page <= 0 {
		page = 1
	}

	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	whereParts := make([]string, 0, 5)
	args := make([]any, 0, 8)

	if clusterID := strings.TrimSpace(filter.ClusterID); clusterID != "" {
		whereParts = append(whereParts, fmt.Sprintf("cluster_id = $%d", len(args)+1))
		args = append(args, clusterID)
	}

	if status := strings.TrimSpace(string(filter.Status)); status != "" {
		whereParts = append(whereParts, fmt.Sprintf("status = $%d", len(args)+1))
		args = append(args, status)
	}

	if action := strings.TrimSpace(filter.Action); action != "" {
		whereParts = append(whereParts, fmt.Sprintf("action = $%d", len(args)+1))
		args = append(args, action)
	}

	if resourceType := strings.TrimSpace(filter.ResourceType); resourceType != "" {
		whereParts = append(whereParts, fmt.Sprintf("resource_type = $%d", len(args)+1))
		args = append(args, resourceType)
	}

	if resourceName := strings.TrimSpace(filter.ResourceName); resourceName != "" {
		whereParts = append(whereParts, fmt.Sprintf("resource_name = $%d", len(args)+1))
		args = append(args, resourceName)
	}

	if namespace := strings.TrimSpace(filter.Namespace); namespace != "" {
		whereParts = append(whereParts, fmt.Sprintf("namespace = $%d", len(args)+1))
		args = append(args, namespace)
	}

	if queryValue := strings.TrimSpace(filter.Query); queryValue != "" {
		pattern := "%" + queryValue + "%"
		whereParts = append(whereParts, fmt.Sprintf("(resource_name ILIKE $%d OR message ILIKE $%d OR actor_name ILIKE $%d OR cluster_name ILIKE $%d)", len(args)+1, len(args)+1, len(args)+1, len(args)+1))
		args = append(args, pattern)
	}

	whereClause := ""
	if len(whereParts) > 0 {
		whereClause = " WHERE " + strings.Join(whereParts, " AND ")
	}

	var total int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(1) FROM audit_logs`+whereClause, args...).Scan(&total); err != nil {
		return nil, err
	}

	query := `
		SELECT
			id,
			action,
			resource_type,
			resource_name,
			namespace,
			cluster_id,
			cluster_name,
			status,
			message,
			actor_name,
			actor_email,
			details::text,
			created_at
		FROM audit_logs
	` + whereClause + fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)

	args = append(args, pageSize, (page-1)*pageSize)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]AuditLogEntry, 0, pageSize)
	for rows.Next() {
		var entry AuditLogEntry
		var status string
		var details string
		if err := rows.Scan(
			&entry.ID,
			&entry.Action,
			&entry.ResourceType,
			&entry.ResourceName,
			&entry.Namespace,
			&entry.ClusterID,
			&entry.ClusterName,
			&status,
			&entry.Message,
			&entry.ActorName,
			&entry.ActorEmail,
			&details,
			&entry.CreatedAt,
		); err != nil {
			return nil, err
		}

		entry.Status = AuditStatus(status)
		entry.Details = json.RawMessage(details)
		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &AuditLogListResult{
		Items:    entries,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func marshalAuditDetails(details any) (json.RawMessage, error) {
	if details == nil {
		return json.RawMessage(`{}`), nil
	}

	payload, err := json.Marshal(details)
	if err != nil {
		return nil, err
	}
	if len(payload) == 0 {
		return json.RawMessage(`{}`), nil
	}

	return json.RawMessage(payload), nil
}

func newAuditID() string {
	buffer := make([]byte, 6)
	if _, err := rand.Read(buffer); err != nil {
		return "audit-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "audit-" + hex.EncodeToString(buffer)
}
