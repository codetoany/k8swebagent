package cache

import (
	"context"
	"encoding/json"
	"time"

	"k8s-agent-backend/internal/config"

	"github.com/redis/go-redis/v9"
)

type RedisCache struct {
	client *redis.Client
	ttl    time.Duration
}

func NewRedisCache(ctx context.Context, cfg config.RedisConfig) *RedisCache {
	if !cfg.Enabled {
		return &RedisCache{}
	}

	options, err := redis.ParseURL(cfg.URL)
	if err != nil {
		return &RedisCache{}
	}

	client := redis.NewClient(options)
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx).Err(); err != nil {
		_ = client.Close()
		return &RedisCache{}
	}

	return &RedisCache{
		client: client,
		ttl:    time.Duration(cfg.TTLSeconds) * time.Second,
	}
}

func (c *RedisCache) Status() string {
	if c.client == nil {
		return "disabled"
	}

	return "up"
}

func (c *RedisCache) Get(ctx context.Context, key string) (json.RawMessage, bool, error) {
	if c.client == nil {
		return nil, false, nil
	}

	value, err := c.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, false, nil
	}

	if err != nil {
		return nil, false, nil
	}

	return json.RawMessage(value), true, nil
}

func (c *RedisCache) Set(ctx context.Context, key string, value json.RawMessage) error {
	if c.client == nil {
		return nil
	}

	if err := c.client.Set(ctx, key, value, c.ttl).Err(); err != nil {
		return nil
	}

	return nil
}

func (c *RedisCache) Close() error {
	if c.client == nil {
		return nil
	}

	return c.client.Close()
}
