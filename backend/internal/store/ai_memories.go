package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AIMemory struct {
	ID                string          `json:"id"`
	ClusterID         string          `json:"clusterId,omitempty"`
	ClusterName       string          `json:"clusterName,omitempty"`
	SourceType        string          `json:"sourceType"`
	SourceID          string          `json:"sourceId,omitempty"`
	ResourceKind      string          `json:"resourceKind,omitempty"`
	ResourceScope     string          `json:"resourceScope,omitempty"`
	ResourceNamespace string          `json:"resourceNamespace,omitempty"`
	ResourceName      string          `json:"resourceName,omitempty"`
	FeedbackLabel     string          `json:"feedbackLabel,omitempty"`
	Title             string          `json:"title"`
	Summary           string          `json:"summary"`
	Tags              json.RawMessage `json:"tags,omitempty"`
	Payload           json.RawMessage `json:"payload,omitempty"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type SaveAIMemoryInput struct {
	ID                string
	ClusterID         string
	ClusterName       string
	SourceType        string
	SourceID          string
	ResourceKind      string
	ResourceScope     string
	ResourceNamespace string
	ResourceName      string
	FeedbackLabel     string
	Title             string
	Summary           string
	Tags              any
	Payload           any
}

type AIMemoryFilter struct {
	ClusterID  string
	Query      string
	SourceType string
	Limit      int
}

type AIMemoryResourceFilter struct {
	ClusterID         string
	ResourceKind      string
	ResourceScope     string
	ResourceNamespace string
	ResourceName      string
	Limit             int
}

type AIMemoryStore struct {
	pool *pgxpool.Pool
}

func NewAIMemoryStore(pool *pgxpool.Pool) *AIMemoryStore {
	return &AIMemoryStore{pool: pool}
}

func (s *AIMemoryStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ai_memories (
			id TEXT PRIMARY KEY,
			cluster_id TEXT NOT NULL DEFAULT '',
			cluster_name TEXT NOT NULL DEFAULT '',
			source_type TEXT NOT NULL DEFAULT '',
			source_id TEXT NOT NULL DEFAULT '',
			resource_kind TEXT NOT NULL DEFAULT '',
			resource_scope TEXT NOT NULL DEFAULT '',
			resource_namespace TEXT NOT NULL DEFAULT '',
			resource_name TEXT NOT NULL DEFAULT '',
			feedback_label TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			summary TEXT NOT NULL DEFAULT '',
			tags JSONB NOT NULL DEFAULT '[]'::jsonb,
			payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_memories_source
		ON ai_memories (source_type, source_id)
		WHERE source_id <> ''
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_memories_cluster_resource
		ON ai_memories (cluster_id, resource_kind, resource_scope, resource_namespace, resource_name, updated_at DESC)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_memories_updated_at
		ON ai_memories (updated_at DESC)
	`)
	return err
}

func (s *AIMemoryStore) Save(ctx context.Context, input SaveAIMemoryInput) (*AIMemory, error) {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = newAIMemoryID()
	}

	tags, err := marshalAIMemoryJSON(input.Tags, `[]`)
	if err != nil {
		return nil, err
	}
	payload, err := marshalAIMemoryJSON(input.Payload, `{}`)
	if err != nil {
		return nil, err
	}

	sourceType := strings.TrimSpace(input.SourceType)
	sourceID := strings.TrimSpace(input.SourceID)

	if sourceID != "" {
		var existingID string
		findErr := s.pool.QueryRow(ctx, `
			SELECT id
			FROM ai_memories
			WHERE source_type = $1 AND source_id = $2
		`, sourceType, sourceID).Scan(&existingID)
		if findErr != nil && !errors.Is(findErr, pgx.ErrNoRows) {
			return nil, findErr
		}

		if existingID != "" {
			row := s.pool.QueryRow(ctx, `
				UPDATE ai_memories
				SET cluster_id = $2,
					cluster_name = $3,
					resource_kind = $4,
					resource_scope = $5,
					resource_namespace = $6,
					resource_name = $7,
					feedback_label = $8,
					title = $9,
					summary = $10,
					tags = $11::jsonb,
					payload = $12::jsonb,
					updated_at = NOW()
				WHERE id = $1
				RETURNING
					id, cluster_id, cluster_name, source_type, source_id, resource_kind, resource_scope,
					resource_namespace, resource_name, feedback_label, title, summary, tags::text, payload::text,
					created_at, updated_at
			`,
				existingID,
				strings.TrimSpace(input.ClusterID),
				strings.TrimSpace(input.ClusterName),
				strings.TrimSpace(input.ResourceKind),
				strings.TrimSpace(input.ResourceScope),
				strings.TrimSpace(input.ResourceNamespace),
				strings.TrimSpace(input.ResourceName),
				strings.TrimSpace(input.FeedbackLabel),
				strings.TrimSpace(input.Title),
				strings.TrimSpace(input.Summary),
				string(tags),
				string(payload),
			)
			return scanAIMemory(row)
		}
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO ai_memories (
			id,
			cluster_id,
			cluster_name,
			source_type,
			source_id,
			resource_kind,
			resource_scope,
			resource_namespace,
			resource_name,
			feedback_label,
			title,
			summary,
			tags,
			payload
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb
		)
		RETURNING
			id, cluster_id, cluster_name, source_type, source_id, resource_kind, resource_scope,
			resource_namespace, resource_name, feedback_label, title, summary, tags::text, payload::text,
			created_at, updated_at
	`,
		id,
		strings.TrimSpace(input.ClusterID),
		strings.TrimSpace(input.ClusterName),
		sourceType,
		sourceID,
		strings.TrimSpace(input.ResourceKind),
		strings.TrimSpace(input.ResourceScope),
		strings.TrimSpace(input.ResourceNamespace),
		strings.TrimSpace(input.ResourceName),
		strings.TrimSpace(input.FeedbackLabel),
		strings.TrimSpace(input.Title),
		strings.TrimSpace(input.Summary),
		string(tags),
		string(payload),
	)
	return scanAIMemory(row)
}

func (s *AIMemoryStore) List(ctx context.Context, filter AIMemoryFilter) ([]AIMemory, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	whereParts := make([]string, 0, 4)
	args := make([]any, 0, 5)

	if clusterID := strings.TrimSpace(filter.ClusterID); clusterID != "" {
		whereParts = append(whereParts, fmt.Sprintf("cluster_id = $%d", len(args)+1))
		args = append(args, clusterID)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		whereParts = append(whereParts, fmt.Sprintf("source_type = $%d", len(args)+1))
		args = append(args, sourceType)
	}
	if query := strings.TrimSpace(filter.Query); query != "" {
		pattern := "%" + query + "%"
		whereParts = append(whereParts, fmt.Sprintf("(title ILIKE $%d OR summary ILIKE $%d OR resource_name ILIKE $%d)", len(args)+1, len(args)+1, len(args)+1))
		args = append(args, pattern)
	}

	query := `
		SELECT
			id, cluster_id, cluster_name, source_type, source_id, resource_kind, resource_scope,
			resource_namespace, resource_name, feedback_label, title, summary, tags::text, payload::text,
			created_at, updated_at
		FROM ai_memories
	`
	if len(whereParts) > 0 {
		query += " WHERE " + strings.Join(whereParts, " AND ")
	}
	query += fmt.Sprintf(" ORDER BY updated_at DESC LIMIT $%d", len(args)+1)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AIMemory, 0, limit)
	for rows.Next() {
		item, scanErr := scanAIMemory(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, *item)
	}

	return items, rows.Err()
}

func (s *AIMemoryStore) ListByResource(ctx context.Context, filter AIMemoryResourceFilter) ([]AIMemory, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	query := `
		SELECT
			id, cluster_id, cluster_name, source_type, source_id, resource_kind, resource_scope,
			resource_namespace, resource_name, feedback_label, title, summary, tags::text, payload::text,
			created_at, updated_at
		FROM ai_memories
		WHERE cluster_id = $1
		  AND resource_kind = $2
		  AND resource_scope = $3
		  AND resource_namespace = $4
		  AND resource_name = $5
		ORDER BY updated_at DESC
		LIMIT $6
	`

	rows, err := s.pool.Query(ctx, query,
		strings.TrimSpace(filter.ClusterID),
		strings.TrimSpace(filter.ResourceKind),
		strings.TrimSpace(filter.ResourceScope),
		strings.TrimSpace(filter.ResourceNamespace),
		strings.TrimSpace(filter.ResourceName),
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AIMemory, 0, limit)
	for rows.Next() {
		item, scanErr := scanAIMemory(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, *item)
	}

	return items, rows.Err()
}

func scanAIMemory(scanner interface{ Scan(dest ...any) error }) (*AIMemory, error) {
	var (
		item       AIMemory
		tagsRaw    string
		payloadRaw string
	)
	err := scanner.Scan(
		&item.ID,
		&item.ClusterID,
		&item.ClusterName,
		&item.SourceType,
		&item.SourceID,
		&item.ResourceKind,
		&item.ResourceScope,
		&item.ResourceNamespace,
		&item.ResourceName,
		&item.FeedbackLabel,
		&item.Title,
		&item.Summary,
		&tagsRaw,
		&payloadRaw,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	item.Tags = json.RawMessage(tagsRaw)
	item.Payload = json.RawMessage(payloadRaw)
	return &item, nil
}

func marshalAIMemoryJSON(value any, fallback string) (json.RawMessage, error) {
	if value == nil {
		return json.RawMessage(fallback), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return json.RawMessage(fallback), nil
	}
	return json.RawMessage(raw), nil
}

func newAIMemoryID() string {
	buffer := make([]byte, 6)
	if _, err := rand.Read(buffer); err != nil {
		return "memory-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "memory-" + hex.EncodeToString(buffer)
}
