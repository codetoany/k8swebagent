package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrAIConversationNotFound = errors.New("ai conversation not found")

type AIConversation struct {
	ID          string              `json:"id"`
	Title       string              `json:"title"`
	Summary     string              `json:"summary"`
	ClusterID   string              `json:"clusterId,omitempty"`
	ClusterName string              `json:"clusterName,omitempty"`
	ModelID     string              `json:"modelId,omitempty"`
	ModelName   string              `json:"modelName,omitempty"`
	CreatedAt   time.Time           `json:"createdAt"`
	UpdatedAt   time.Time           `json:"updatedAt"`
	Messages    []AIConversationMsg `json:"messages,omitempty"`
}

type AIConversationMsg struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type AIConversationStore struct {
	pool *pgxpool.Pool
}

type SaveAIConversationInput struct {
	ConversationID   string
	Title            string
	Summary          string
	ClusterID        string
	ClusterName      string
	ModelID          string
	ModelName        string
	UserMessage      string
	AssistantMessage string
}

func NewAIConversationStore(pool *pgxpool.Pool) *AIConversationStore {
	return &AIConversationStore{pool: pool}
}

func (s *AIConversationStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ai_conversations (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT '',
			summary TEXT NOT NULL DEFAULT '',
			cluster_id TEXT NOT NULL DEFAULT '',
			cluster_name TEXT NOT NULL DEFAULT '',
			model_id TEXT NOT NULL DEFAULT '',
			model_name TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ai_conversation_messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at
		ON ai_conversations (updated_at DESC)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_conversations_cluster_id
		ON ai_conversations (cluster_id)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conversation_id
		ON ai_conversation_messages (conversation_id, created_at ASC)
	`)
	return err
}

func (s *AIConversationStore) List(ctx context.Context, clusterID string, limit int) ([]AIConversation, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	args := []any{limit}
	query := `
		SELECT
			id,
			title,
			summary,
			cluster_id,
			cluster_name,
			model_id,
			model_name,
			created_at,
			updated_at
		FROM ai_conversations
	`
	if strings.TrimSpace(clusterID) != "" {
		query += ` WHERE cluster_id = $2`
		args = append(args, strings.TrimSpace(clusterID))
	}
	query += ` ORDER BY updated_at DESC LIMIT $1`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AIConversation, 0, limit)
	for rows.Next() {
		var item AIConversation
		if err := rows.Scan(
			&item.ID,
			&item.Title,
			&item.Summary,
			&item.ClusterID,
			&item.ClusterName,
			&item.ModelID,
			&item.ModelName,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (s *AIConversationStore) Get(ctx context.Context, conversationID string) (*AIConversation, error) {
	conversationID = strings.TrimSpace(conversationID)
	if conversationID == "" {
		return nil, ErrAIConversationNotFound
	}

	var item AIConversation
	err := s.pool.QueryRow(ctx, `
		SELECT
			id,
			title,
			summary,
			cluster_id,
			cluster_name,
			model_id,
			model_name,
			created_at,
			updated_at
		FROM ai_conversations
		WHERE id = $1
	`, conversationID).Scan(
		&item.ID,
		&item.Title,
		&item.Summary,
		&item.ClusterID,
		&item.ClusterName,
		&item.ModelID,
		&item.ModelName,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAIConversationNotFound
	}
	if err != nil {
		return nil, err
	}

	messages, err := s.ListMessages(ctx, conversationID, 0)
	if err != nil {
		return nil, err
	}
	item.Messages = messages
	return &item, nil
}

func (s *AIConversationStore) ListMessages(ctx context.Context, conversationID string, limit int) ([]AIConversationMsg, error) {
	conversationID = strings.TrimSpace(conversationID)
	if conversationID == "" {
		return nil, ErrAIConversationNotFound
	}

	query := `
		SELECT
			id,
			role,
			content,
			created_at
		FROM ai_conversation_messages
		WHERE conversation_id = $1
		ORDER BY created_at ASC
	`
	args := []any{conversationID}
	if limit > 0 {
		query = `
			SELECT
				id,
				role,
				content,
				created_at
			FROM (
				SELECT
					id,
					role,
					content,
					created_at
				FROM ai_conversation_messages
				WHERE conversation_id = $1
				ORDER BY created_at DESC
				LIMIT $2
			) AS recent_messages
			ORDER BY created_at ASC
		`
		args = append(args, limit)
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AIConversationMsg, 0)
	for rows.Next() {
		var item AIConversationMsg
		if err := rows.Scan(&item.ID, &item.Role, &item.Content, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (s *AIConversationStore) SaveExchange(ctx context.Context, input SaveAIConversationInput) (*AIConversation, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	conversationID := strings.TrimSpace(input.ConversationID)
	if conversationID == "" {
		conversationID = newAIConversationID()
	}

	var existingTitle string
	var existingCreatedAt time.Time
	findErr := tx.QueryRow(ctx, `
		SELECT title, created_at
		FROM ai_conversations
		WHERE id = $1
	`, conversationID).Scan(&existingTitle, &existingCreatedAt)
	if findErr != nil && !errors.Is(findErr, pgx.ErrNoRows) {
		return nil, findErr
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = strings.TrimSpace(existingTitle)
	}
	if title == "" {
		title = truncatePlainText(input.UserMessage, 36)
	}

	summary := strings.TrimSpace(input.Summary)
	if summary == "" {
		summary = truncatePlainText(input.AssistantMessage, 120)
	}

	if errors.Is(findErr, pgx.ErrNoRows) {
		_, err = tx.Exec(ctx, `
			INSERT INTO ai_conversations (
				id,
				title,
				summary,
				cluster_id,
				cluster_name,
				model_id,
				model_name
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
		`,
			conversationID,
			title,
			summary,
			strings.TrimSpace(input.ClusterID),
			strings.TrimSpace(input.ClusterName),
			strings.TrimSpace(input.ModelID),
			strings.TrimSpace(input.ModelName),
		)
	} else {
		_, err = tx.Exec(ctx, `
			UPDATE ai_conversations
			SET title = $2,
				summary = $3,
				cluster_id = $4,
				cluster_name = $5,
				model_id = $6,
				model_name = $7,
				updated_at = NOW()
			WHERE id = $1
		`,
			conversationID,
			title,
			summary,
			strings.TrimSpace(input.ClusterID),
			strings.TrimSpace(input.ClusterName),
			strings.TrimSpace(input.ModelID),
			strings.TrimSpace(input.ModelName),
		)
	}
	if err != nil {
		return nil, err
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO ai_conversation_messages (id, conversation_id, role, content)
		VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)
	`,
		newAIConversationMessageID(),
		conversationID,
		"user",
		strings.TrimSpace(input.UserMessage),
		newAIConversationMessageID(),
		"assistant",
		strings.TrimSpace(input.AssistantMessage),
	); err != nil {
		return nil, err
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.Get(ctx, conversationID)
}

func (s *AIConversationStore) Delete(ctx context.Context, conversationID string) error {
	commandTag, err := s.pool.Exec(ctx, `
		DELETE FROM ai_conversations
		WHERE id = $1
	`, strings.TrimSpace(conversationID))
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return ErrAIConversationNotFound
	}
	return nil
}

func newAIConversationID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "conv-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "conv-" + hex.EncodeToString(buffer)
}

func newAIConversationMessageID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "msg-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "msg-" + hex.EncodeToString(buffer)
}

func truncatePlainText(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	if value == "" || maxRunes <= 0 {
		return ""
	}

	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}

	return strings.TrimSpace(string(runes[:maxRunes])) + "..."
}
