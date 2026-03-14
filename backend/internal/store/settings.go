package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	SettingsKeySystem             = "system"
	SettingsKeyAIModels           = "ai-models"
	SettingsKeyNotificationsState = "notifications-state"
)

var defaultSettingsPayloads = map[string]json.RawMessage{
	SettingsKeySystem: json.RawMessage(`{
  "theme": "system",
  "language": "zh-CN",
  "autoRefreshInterval": 30,
  "showResourceUsage": true,
  "showEvents": true,
  "showNamespaceDistribution": true,
  "navigationPosition": "left",
  "notifications": {
    "level": "all",
    "enabledTypes": ["node", "pod", "workload"]
  }
}`),
	SettingsKeyAIModels: json.RawMessage(`[
  {
    "id": "openai-gpt4o",
    "name": "OpenAI GPT-4o",
    "apiBaseUrl": "https://api.openai.com/v1",
    "apiKey": "",
    "modelType": "openai",
    "isDefault": true
  },
  {
    "id": "anthropic-claude3",
    "name": "Anthropic Claude 3",
    "apiBaseUrl": "https://api.anthropic.com/v1",
    "apiKey": "",
    "modelType": "anthropic",
    "isDefault": false
  }
]`),
	SettingsKeyNotificationsState: json.RawMessage(`{
  "lastReadAt": ""
}`),
}

type SettingsStore struct {
	pool *pgxpool.Pool
}

func NewSettingsStore(pool *pgxpool.Pool) *SettingsStore {
	return &SettingsStore{pool: pool}
}

func (s *SettingsStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			payload JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	for key, payload := range defaultSettingsPayloads {
		if err := s.PutRawIfMissing(ctx, key, payload); err != nil {
			return err
		}
	}

	return nil
}

func (s *SettingsStore) Get(ctx context.Context, key string) (json.RawMessage, error) {
	var payload string
	err := s.pool.QueryRow(ctx, `
		SELECT payload::text
		FROM app_settings
		WHERE key = $1
	`, key).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return json.RawMessage(payload), nil
}

func (s *SettingsStore) Put(ctx context.Context, key string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return s.PutRaw(ctx, key, raw)
}

func (s *SettingsStore) PutRaw(ctx context.Context, key string, payload json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO app_settings (key, payload)
		VALUES ($1, $2::jsonb)
		ON CONFLICT (key) DO UPDATE
		SET payload = EXCLUDED.payload,
		    updated_at = NOW()
	`, key, payload)
	return err
}

func (s *SettingsStore) PutRawIfMissing(ctx context.Context, key string, payload json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO app_settings (key, payload)
		VALUES ($1, $2::jsonb)
		ON CONFLICT (key) DO NOTHING
	`, key, payload)
	return err
}
