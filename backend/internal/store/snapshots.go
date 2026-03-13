package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"k8s-agent-backend/internal/cache"
	"k8s-agent-backend/internal/config"
	"k8s-agent-backend/internal/data"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SnapshotStore struct {
	pool  *pgxpool.Pool
	cache *cache.RedisCache
}

func NewPool(ctx context.Context, cfg config.PGConfig) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.Database,
	)

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}

func NewSnapshotStore(pool *pgxpool.Pool, cache *cache.RedisCache) *SnapshotStore {
	return &SnapshotStore{
		pool:  pool,
		cache: cache,
	}
}

func (s *SnapshotStore) Init(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS api_snapshots (
			scope TEXT NOT NULL,
			key TEXT NOT NULL,
			payload JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (scope, key)
		)
	`)
	if err != nil {
		return err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	for _, snapshot := range data.SnapshotSeeds {
		_, err = tx.Exec(ctx, `
			INSERT INTO api_snapshots (scope, key, payload)
			VALUES ($1, $2, $3::jsonb)
			ON CONFLICT (scope, key) DO UPDATE
			SET payload = EXCLUDED.payload,
			    updated_at = NOW()
		`, snapshot.Scope, snapshot.Key, snapshot.Payload)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *SnapshotStore) Get(ctx context.Context, scope string, key string) (json.RawMessage, error) {
	cacheKey := fmt.Sprintf("snapshot:%s:%s", scope, key)
	if s.cache != nil {
		cached, found, err := s.cache.Get(ctx, cacheKey)
		if err != nil {
			return nil, err
		}
		if found {
			return cached, nil
		}
	}

	var payload string
	err := s.pool.QueryRow(ctx, `
		SELECT payload::text
		FROM api_snapshots
		WHERE scope = $1 AND key = $2
	`, scope, key).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	raw := json.RawMessage(payload)
	if s.cache != nil {
		_ = s.cache.Set(ctx, cacheKey, raw)
	}

	return raw, nil
}

func (s *SnapshotStore) Ping(ctx context.Context) error {
	return s.pool.QueryRow(ctx, `SELECT 1`).Scan(new(int))
}
