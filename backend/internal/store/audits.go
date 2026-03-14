package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
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
	ClusterID string
	Limit     int
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

func (s *AuditStore) List(ctx context.Context, filter AuditLogFilter) ([]AuditLogEntry, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
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
	`
	args := []any{}
	if strings.TrimSpace(filter.ClusterID) != "" {
		query += ` WHERE cluster_id = $1 `
		args = append(args, strings.TrimSpace(filter.ClusterID))
	}
	query += ` ORDER BY created_at DESC LIMIT `
	if len(args) == 0 {
		query += `$1`
		args = append(args, limit)
	} else {
		query += `$2`
		args = append(args, limit)
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]AuditLogEntry, 0, limit)
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

	return entries, rows.Err()
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
