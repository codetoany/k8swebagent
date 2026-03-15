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

var ErrAITemplateNotFound = errors.New("ai template not found")

type AITemplate struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Prompt      string    `json:"prompt"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type SaveAITemplateInput struct {
	ID          string
	Title       string
	Description string
	Category    string
	Prompt      string
}

type AITemplateStore struct {
	pool *pgxpool.Pool
}

func NewAITemplateStore(pool *pgxpool.Pool) *AITemplateStore {
	return &AITemplateStore{pool: pool}
}

func (s *AITemplateStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ai_templates (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			category TEXT NOT NULL DEFAULT '',
			prompt TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ai_templates_updated_at
		ON ai_templates (updated_at DESC)
	`)
	return err
}

func (s *AITemplateStore) List(ctx context.Context) ([]AITemplate, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, title, description, category, prompt, created_at, updated_at
		FROM ai_templates
		ORDER BY updated_at DESC, title ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]AITemplate, 0)
	for rows.Next() {
		var item AITemplate
		if err := rows.Scan(
			&item.ID,
			&item.Title,
			&item.Description,
			&item.Category,
			&item.Prompt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, rows.Err()
}

func (s *AITemplateStore) Get(ctx context.Context, id string) (*AITemplate, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, ErrAITemplateNotFound
	}

	var item AITemplate
	err := s.pool.QueryRow(ctx, `
		SELECT id, title, description, category, prompt, created_at, updated_at
		FROM ai_templates
		WHERE id = $1
	`, id).Scan(
		&item.ID,
		&item.Title,
		&item.Description,
		&item.Category,
		&item.Prompt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAITemplateNotFound
	}
	if err != nil {
		return nil, err
	}

	return &item, nil
}

func (s *AITemplateStore) Save(ctx context.Context, input SaveAITemplateInput) (*AITemplate, error) {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = newAITemplateID()
	}

	var item AITemplate
	err := s.pool.QueryRow(ctx, `
		INSERT INTO ai_templates (
			id,
			title,
			description,
			category,
			prompt
		) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE
		SET title = EXCLUDED.title,
			description = EXCLUDED.description,
			category = EXCLUDED.category,
			prompt = EXCLUDED.prompt,
			updated_at = NOW()
		RETURNING id, title, description, category, prompt, created_at, updated_at
	`,
		id,
		strings.TrimSpace(input.Title),
		strings.TrimSpace(input.Description),
		strings.TrimSpace(input.Category),
		strings.TrimSpace(input.Prompt),
	).Scan(
		&item.ID,
		&item.Title,
		&item.Description,
		&item.Category,
		&item.Prompt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &item, nil
}

func (s *AITemplateStore) Delete(ctx context.Context, id string) error {
	commandTag, err := s.pool.Exec(ctx, `
		DELETE FROM ai_templates
		WHERE id = $1
	`, strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return ErrAITemplateNotFound
	}
	return nil
}

func newAITemplateID() string {
	buffer := make([]byte, 6)
	if _, err := rand.Read(buffer); err != nil {
		return "template-" + time.Now().UTC().Format("20060102150405.000000000")
	}

	return "template-" + hex.EncodeToString(buffer)
}
