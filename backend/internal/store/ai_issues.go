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

const (
	AIIssueStatusNew       = "new"
	AIIssueStatusFollowing = "following"
	AIIssueStatusAcknowledged = "acknowledged"
	AIIssueStatusSilenced  = "silenced"
	AIIssueStatusEscalated = "escalated"
	AIIssueStatusResolved  = "resolved"
	AIIssueStatusRecovered = "recovered"
)

var ErrAIIssueNotFound = errors.New("ai issue not found")

type AIIssue struct {
	ID              string          `json:"id"`
	IssueKey        string          `json:"issueKey"`
	ClusterID       string          `json:"clusterId,omitempty"`
	ClusterName     string          `json:"clusterName,omitempty"`
	Category        string          `json:"category"`
	Title           string          `json:"title"`
	Summary         string          `json:"summary"`
	RiskLevel       string          `json:"riskLevel"`
	Score           int             `json:"score"`
	AffectedCount   int             `json:"affectedCount"`
	OccurrenceCount int             `json:"occurrenceCount"`
	Status          string          `json:"status"`
	Note            string          `json:"note,omitempty"`
	SourceID        string          `json:"sourceId,omitempty"`
	Target          json.RawMessage `json:"target,omitempty"`
	Evidence        json.RawMessage `json:"evidence,omitempty"`
	Actions         json.RawMessage `json:"actions,omitempty"`
	AcknowledgedAt  *time.Time      `json:"acknowledgedAt,omitempty"`
	SilencedUntil   *time.Time      `json:"silencedUntil,omitempty"`
	EscalationLevel string          `json:"escalationLevel,omitempty"`
	EscalatedAt     *time.Time      `json:"escalatedAt,omitempty"`
	FirstDetectedAt time.Time       `json:"firstDetectedAt"`
	LastDetectedAt  time.Time       `json:"lastDetectedAt"`
	ResolvedAt      *time.Time      `json:"resolvedAt,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

type AIIssueSyncEntry struct {
	IssueKey      string
	Category      string
	Title         string
	Summary       string
	RiskLevel     string
	Score         int
	AffectedCount int
	Target        any
	Evidence      any
	Actions       any
}

type SyncAIIssuesInput struct {
	ClusterID   string
	ClusterName string
	SourceID    string
	DetectedAt  time.Time
	Issues      []AIIssueSyncEntry
}

type AIIssueFilter struct {
	ClusterID string
	Status    string
	RiskLevel string
	Query     string
	Page      int
	PageSize  int
}

type AIIssueListResult struct {
	Items    []AIIssue `json:"items"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	PageSize int       `json:"pageSize"`
}

type UpdateAIIssueStatusInput struct {
	ID              string
	Status          string
	Note            string
	SilencedUntil   *time.Time
	EscalationLevel string
}

type AIIssueStore struct {
	pool *pgxpool.Pool
}

func NewAIIssueStore(pool *pgxpool.Pool) *AIIssueStore {
	return &AIIssueStore{pool: pool}
}

func (s *AIIssueStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ai_issues (
			id TEXT PRIMARY KEY,
			issue_key TEXT NOT NULL,
			cluster_id TEXT NOT NULL DEFAULT '',
			cluster_name TEXT NOT NULL DEFAULT '',
			category TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			summary TEXT NOT NULL DEFAULT '',
			risk_level TEXT NOT NULL DEFAULT 'low',
			score INTEGER NOT NULL DEFAULT 0,
			affected_count INTEGER NOT NULL DEFAULT 0,
			occurrence_count INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'new',
			note TEXT NOT NULL DEFAULT '',
			source_id TEXT NOT NULL DEFAULT '',
			target JSONB NOT NULL DEFAULT '{}'::jsonb,
			evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
			actions JSONB NOT NULL DEFAULT '[]'::jsonb,
			first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			resolved_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	migrations := []string{
		`ALTER TABLE ai_issues ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
		`ALTER TABLE ai_issues ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMPTZ`,
		`ALTER TABLE ai_issues ADD COLUMN IF NOT EXISTS escalation_level TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE ai_issues ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ`,
	}
	for _, statement := range migrations {
		if _, err := s.pool.Exec(ctx, statement); err != nil {
			return err
		}
	}

	_, err = s.pool.Exec(ctx, `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_issues_cluster_key
		ON ai_issues (cluster_id, issue_key)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_issues_cluster_status
		ON ai_issues (cluster_id, status, updated_at DESC)
	`)
	return err
}

func (s *AIIssueStore) SyncInspection(ctx context.Context, input SyncAIIssuesInput) error {
	detectedAt := input.DetectedAt
	if detectedAt.IsZero() {
		detectedAt = time.Now().UTC()
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, issue_key, status, occurrence_count, silenced_until
		FROM ai_issues
		WHERE cluster_id = $1
	`, strings.TrimSpace(input.ClusterID))
	if err != nil {
		return err
	}
	defer rows.Close()

	type existingIssue struct {
		ID              string
		IssueKey        string
		Status          string
		OccurrenceCount int
		SilencedUntil   *time.Time
	}
	existingByKey := make(map[string]existingIssue)
	for rows.Next() {
		var item existingIssue
		if err := rows.Scan(&item.ID, &item.IssueKey, &item.Status, &item.OccurrenceCount, &item.SilencedUntil); err != nil {
			return err
		}
		existingByKey[item.IssueKey] = item
	}
	if err := rows.Err(); err != nil {
		return err
	}

	incomingKeys := make(map[string]struct{}, len(input.Issues))
	for _, issue := range input.Issues {
		issueKey := strings.TrimSpace(issue.IssueKey)
		if issueKey == "" {
			continue
		}
		incomingKeys[issueKey] = struct{}{}

		target, err := marshalAIIssueJSON(issue.Target, `{}`)
		if err != nil {
			return err
		}
		evidence, err := marshalAIIssueJSON(issue.Evidence, `[]`)
		if err != nil {
			return err
		}
		actions, err := marshalAIIssueJSON(issue.Actions, `[]`)
		if err != nil {
			return err
		}

		if existing, ok := existingByKey[issueKey]; ok {
			nextStatus := existing.Status
			resolvedAt := any(nil)
			resetWorkflow := false
			if existing.Status == AIIssueStatusResolved || existing.Status == AIIssueStatusRecovered {
				nextStatus = AIIssueStatusNew
				resetWorkflow = true
			}
			if existing.Status == AIIssueStatusSilenced && (existing.SilencedUntil == nil || !existing.SilencedUntil.After(detectedAt)) {
				nextStatus = AIIssueStatusNew
				resetWorkflow = true
			}
			if nextStatus == AIIssueStatusResolved {
				resolvedAt = detectedAt
			}
			_, err = s.pool.Exec(ctx, `
				UPDATE ai_issues
				SET cluster_name = $2,
					category = $3,
					title = $4,
					summary = $5,
					risk_level = $6,
					score = $7,
					affected_count = $8,
					occurrence_count = $9,
					status = $10,
					source_id = $11,
					target = $12::jsonb,
					evidence = $13::jsonb,
					actions = $14::jsonb,
					last_detected_at = $15,
					resolved_at = $16,
					acknowledged_at = CASE WHEN $17 THEN NULL ELSE acknowledged_at END,
					silenced_until = CASE WHEN $17 THEN NULL ELSE silenced_until END,
					escalation_level = CASE WHEN $17 THEN '' ELSE escalation_level END,
					escalated_at = CASE WHEN $17 THEN NULL ELSE escalated_at END,
					updated_at = NOW()
				WHERE id = $1
			`,
				existing.ID,
				strings.TrimSpace(input.ClusterName),
				strings.TrimSpace(issue.Category),
				strings.TrimSpace(issue.Title),
				strings.TrimSpace(issue.Summary),
				coalesceIssueString(issue.RiskLevel, "low"),
				issue.Score,
				issue.AffectedCount,
				existing.OccurrenceCount+1,
				nextStatus,
				strings.TrimSpace(input.SourceID),
				string(target),
				string(evidence),
				string(actions),
				detectedAt,
				resolvedAt,
				resetWorkflow,
			)
			if err != nil {
				return err
			}
			continue
		}

		_, err = s.pool.Exec(ctx, `
			INSERT INTO ai_issues (
				id, issue_key, cluster_id, cluster_name, category, title, summary, risk_level, score,
				affected_count, occurrence_count, status, source_id, target, evidence, actions,
				first_detected_at, last_detected_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9,
				$10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
				$17, $18
			)
		`,
			newAIIssueID(),
			issueKey,
			strings.TrimSpace(input.ClusterID),
			strings.TrimSpace(input.ClusterName),
			strings.TrimSpace(issue.Category),
			strings.TrimSpace(issue.Title),
			strings.TrimSpace(issue.Summary),
			coalesceIssueString(issue.RiskLevel, "low"),
			issue.Score,
			issue.AffectedCount,
			1,
			AIIssueStatusNew,
			strings.TrimSpace(input.SourceID),
			string(target),
			string(evidence),
			string(actions),
			detectedAt,
			detectedAt,
		)
		if err != nil {
			return err
		}
	}

	for issueKey, existing := range existingByKey {
		if _, seen := incomingKeys[issueKey]; seen {
			continue
		}
		if existing.Status == AIIssueStatusResolved || existing.Status == AIIssueStatusRecovered {
			continue
		}
		_, err := s.pool.Exec(ctx, `
			UPDATE ai_issues
			SET status = $2,
				updated_at = NOW()
			WHERE id = $1
		`, existing.ID, AIIssueStatusRecovered)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *AIIssueStore) List(ctx context.Context, filter AIIssueFilter) (*AIIssueListResult, error) {
	page := filter.Page
	if page <= 0 {
		page = 1
	}

	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 12
	}
	if pageSize > 100 {
		pageSize = 100
	}

	whereParts := make([]string, 0, 4)
	args := make([]any, 0, 8)

	if clusterID := strings.TrimSpace(filter.ClusterID); clusterID != "" {
		whereParts = append(whereParts, fmt.Sprintf("cluster_id = $%d", len(args)+1))
		args = append(args, clusterID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		whereParts = append(whereParts, fmt.Sprintf("status = $%d", len(args)+1))
		args = append(args, status)
	}
	if riskLevel := strings.TrimSpace(filter.RiskLevel); riskLevel != "" {
		whereParts = append(whereParts, fmt.Sprintf("risk_level = $%d", len(args)+1))
		args = append(args, riskLevel)
	}
	if queryValue := strings.TrimSpace(filter.Query); queryValue != "" {
		pattern := "%" + queryValue + "%"
		whereParts = append(whereParts, fmt.Sprintf("(title ILIKE $%d OR summary ILIKE $%d OR category ILIKE $%d)", len(args)+1, len(args)+1, len(args)+1))
		args = append(args, pattern)
	}

	whereClause := ""
	if len(whereParts) > 0 {
		whereClause = " WHERE " + strings.Join(whereParts, " AND ")
	}

	var total int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(1) FROM ai_issues`+whereClause, args...).Scan(&total); err != nil {
		return nil, err
	}

	query := `
		SELECT
			id, issue_key, cluster_id, cluster_name, category, title, summary, risk_level, score,
			affected_count, occurrence_count, status, note, source_id, target::text, evidence::text, actions::text,
			acknowledged_at, silenced_until, escalation_level, escalated_at,
			first_detected_at, last_detected_at, resolved_at, created_at, updated_at
		FROM ai_issues
	` + whereClause + fmt.Sprintf(" ORDER BY updated_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	args = append(args, pageSize, (page-1)*pageSize)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AIIssue, 0, pageSize)
	for rows.Next() {
		item, scanErr := scanAIIssue(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, *item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &AIIssueListResult{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func (s *AIIssueStore) Get(ctx context.Context, id string) (*AIIssue, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT
			id, issue_key, cluster_id, cluster_name, category, title, summary, risk_level, score,
			affected_count, occurrence_count, status, note, source_id, target::text, evidence::text, actions::text,
			acknowledged_at, silenced_until, escalation_level, escalated_at,
			first_detected_at, last_detected_at, resolved_at, created_at, updated_at
		FROM ai_issues
		WHERE id = $1
	`, strings.TrimSpace(id))
	item, err := scanAIIssue(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAIIssueNotFound
	}
	return item, err
}

func (s *AIIssueStore) UpdateStatus(ctx context.Context, id string, status string, note string) (*AIIssue, error) {
	return s.UpdateStatusDetail(ctx, UpdateAIIssueStatusInput{
		ID:     id,
		Status: status,
		Note:   note,
	})
}

func (s *AIIssueStore) UpdateStatusDetail(ctx context.Context, input UpdateAIIssueStatusInput) (*AIIssue, error) {
	status := coalesceIssueString(input.Status, AIIssueStatusFollowing)
	var resolvedAt any
	if status == AIIssueStatusResolved {
		resolvedAt = time.Now().UTC()
	}
	var acknowledgedAt any
	if status == AIIssueStatusAcknowledged {
		acknowledgedAt = time.Now().UTC()
	}
	var silencedUntil any
	if input.SilencedUntil != nil {
		silencedUntil = input.SilencedUntil.UTC()
	}
	var escalatedAt any
	if status == AIIssueStatusEscalated {
		escalatedAt = time.Now().UTC()
	}

	row := s.pool.QueryRow(ctx, `
		UPDATE ai_issues
		SET status = $2,
			note = CASE WHEN $3 <> '' THEN $3 ELSE note END,
			resolved_at = $4::timestamptz,
			acknowledged_at = CASE WHEN $5::timestamptz IS NOT NULL THEN $5::timestamptz ELSE acknowledged_at END,
			silenced_until = CASE WHEN $2 = 'silenced' THEN $6::timestamptz ELSE silenced_until END,
			escalation_level = CASE WHEN $2 = 'escalated' THEN COALESCE($7::text, escalation_level) ELSE escalation_level END,
			escalated_at = CASE WHEN $8::timestamptz IS NOT NULL THEN $8::timestamptz ELSE escalated_at END,
			updated_at = NOW()
		WHERE id = $1
		RETURNING
			id, issue_key, cluster_id, cluster_name, category, title, summary, risk_level, score,
			affected_count, occurrence_count, status, note, source_id, target::text, evidence::text, actions::text,
			acknowledged_at, silenced_until, escalation_level, escalated_at,
			first_detected_at, last_detected_at, resolved_at, created_at, updated_at
	`,
		strings.TrimSpace(input.ID),
		status,
		strings.TrimSpace(input.Note),
		resolvedAt,
		acknowledgedAt,
		silencedUntil,
		strings.TrimSpace(input.EscalationLevel),
		escalatedAt,
	)
	item, err := scanAIIssue(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAIIssueNotFound
	}
	return item, err
}

func scanAIIssue(scanner interface{ Scan(dest ...any) error }) (*AIIssue, error) {
	var (
		item            AIIssue
		targetRaw       string
		evidenceRaw     string
		actionsRaw      string
		acknowledgedAt  *time.Time
		silencedUntil   *time.Time
		escalationLevel string
		escalatedAt     *time.Time
		resolvedAt      *time.Time
	)
	err := scanner.Scan(
		&item.ID,
		&item.IssueKey,
		&item.ClusterID,
		&item.ClusterName,
		&item.Category,
		&item.Title,
		&item.Summary,
		&item.RiskLevel,
		&item.Score,
		&item.AffectedCount,
		&item.OccurrenceCount,
		&item.Status,
		&item.Note,
		&item.SourceID,
		&targetRaw,
		&evidenceRaw,
		&actionsRaw,
		&acknowledgedAt,
		&silencedUntil,
		&escalationLevel,
		&escalatedAt,
		&item.FirstDetectedAt,
		&item.LastDetectedAt,
		&resolvedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	item.Target = json.RawMessage(targetRaw)
	item.Evidence = json.RawMessage(evidenceRaw)
	item.Actions = json.RawMessage(actionsRaw)
	item.AcknowledgedAt = acknowledgedAt
	item.SilencedUntil = silencedUntil
	item.EscalationLevel = strings.TrimSpace(escalationLevel)
	item.EscalatedAt = escalatedAt
	item.ResolvedAt = resolvedAt
	return &item, nil
}

func marshalAIIssueJSON(value any, fallback string) (json.RawMessage, error) {
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

func coalesceIssueString(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func newAIIssueID() string {
	buffer := make([]byte, 6)
	if _, err := rand.Read(buffer); err != nil {
		return "issue-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "issue-" + hex.EncodeToString(buffer)
}
