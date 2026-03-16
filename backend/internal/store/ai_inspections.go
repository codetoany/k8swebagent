package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	AIInspectionStatusSuccess = "success"
	AIInspectionStatusFailed  = "failed"

	AIInspectionTriggerManual    = "manual"
	AIInspectionTriggerScheduled = "scheduled"
	AIInspectionTriggerFollowUp  = "follow-up"
)

type AIInspection struct {
	ID            string          `json:"id"`
	ClusterID     string          `json:"clusterId,omitempty"`
	ClusterName   string          `json:"clusterName,omitempty"`
	TriggerSource string          `json:"triggerSource"`
	Status        string          `json:"status"`
	RiskLevel     string          `json:"riskLevel,omitempty"`
	Summary       string          `json:"summary,omitempty"`
	ErrorMessage  string          `json:"errorMessage,omitempty"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
	CompletedAt   time.Time       `json:"completedAt"`
}

type AIInspectionInput struct {
	ClusterID     string
	ClusterName   string
	TriggerSource string
	Status        string
	RiskLevel     string
	Summary       string
	ErrorMessage  string
	Payload       any
	CompletedAt   time.Time
}

type AIInspectionStore struct {
	pool *pgxpool.Pool
}

func NewAIInspectionStore(pool *pgxpool.Pool) *AIInspectionStore {
	return &AIInspectionStore{pool: pool}
}

func (s *AIInspectionStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ai_inspections (
			id TEXT PRIMARY KEY,
			cluster_id TEXT NOT NULL DEFAULT '',
			cluster_name TEXT NOT NULL DEFAULT '',
			trigger_source TEXT NOT NULL DEFAULT 'manual',
			status TEXT NOT NULL DEFAULT 'success',
			risk_level TEXT NOT NULL DEFAULT '',
			summary TEXT NOT NULL DEFAULT '',
			error_message TEXT NOT NULL DEFAULT '',
			payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

func (s *AIInspectionStore) Save(ctx context.Context, input AIInspectionInput) (*AIInspection, error) {
	payload, err := marshalAIInspectionPayload(input.Payload)
	if err != nil {
		return nil, err
	}

	completedAt := input.CompletedAt
	if completedAt.IsZero() {
		completedAt = time.Now().UTC()
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO ai_inspections (
			id,
			cluster_id,
			cluster_name,
			trigger_source,
			status,
			risk_level,
			summary,
			error_message,
			payload,
			completed_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10
		)
		RETURNING
			id,
			cluster_id,
			cluster_name,
			trigger_source,
			status,
			risk_level,
			summary,
			error_message,
			payload::text,
			created_at,
			completed_at
	`,
		newAIInspectionID(),
		strings.TrimSpace(input.ClusterID),
		strings.TrimSpace(input.ClusterName),
		coalesceInspectionString(input.TriggerSource, AIInspectionTriggerManual),
		coalesceInspectionString(input.Status, AIInspectionStatusSuccess),
		strings.TrimSpace(input.RiskLevel),
		strings.TrimSpace(input.Summary),
		strings.TrimSpace(input.ErrorMessage),
		string(payload),
		completedAt,
	)

	return scanAIInspection(row)
}

func (s *AIInspectionStore) GetLatest(ctx context.Context, clusterID string) (*AIInspection, error) {
	query := `
		SELECT
			id,
			cluster_id,
			cluster_name,
			trigger_source,
			status,
			risk_level,
			summary,
			error_message,
			payload::text,
			created_at,
			completed_at
		FROM ai_inspections
	`
	args := make([]any, 0, 1)
	if strings.TrimSpace(clusterID) != "" {
		query += " WHERE cluster_id = $1"
		args = append(args, strings.TrimSpace(clusterID))
	}
	query += " ORDER BY completed_at DESC LIMIT 1"

	row := s.pool.QueryRow(ctx, query, args...)
	item, err := scanAIInspection(row)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return item, err
}

func (s *AIInspectionStore) List(ctx context.Context, clusterID string, limit int) ([]AIInspection, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	query := `
		SELECT
			id,
			cluster_id,
			cluster_name,
			trigger_source,
			status,
			risk_level,
			summary,
			error_message,
			payload::text,
			created_at,
			completed_at
		FROM ai_inspections
	`
	args := make([]any, 0, 2)
	if strings.TrimSpace(clusterID) != "" {
		query += fmt.Sprintf(" WHERE cluster_id = $%d", len(args)+1)
		args = append(args, strings.TrimSpace(clusterID))
	}
	query += fmt.Sprintf(" ORDER BY completed_at DESC LIMIT $%d", len(args)+1)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AIInspection, 0, limit)
	for rows.Next() {
		item, scanErr := scanAIInspection(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, *item)
	}

	return items, rows.Err()
}

func scanAIInspection(scanner interface{ Scan(dest ...any) error }) (*AIInspection, error) {
	var (
		item       AIInspection
		payloadRaw string
	)
	err := scanner.Scan(
		&item.ID,
		&item.ClusterID,
		&item.ClusterName,
		&item.TriggerSource,
		&item.Status,
		&item.RiskLevel,
		&item.Summary,
		&item.ErrorMessage,
		&payloadRaw,
		&item.CreatedAt,
		&item.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	item.Payload = json.RawMessage(payloadRaw)
	return &item, nil
}

func marshalAIInspectionPayload(payload any) (json.RawMessage, error) {
	if payload == nil {
		return json.RawMessage(`{}`), nil
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return json.RawMessage(`{}`), nil
	}
	return json.RawMessage(raw), nil
}

func coalesceInspectionString(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func newAIInspectionID() string {
	buffer := make([]byte, 6)
	if _, err := rand.Read(buffer); err != nil {
		return "inspection-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "inspection-" + hex.EncodeToString(buffer)
}
