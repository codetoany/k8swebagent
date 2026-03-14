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
	return c.SetWithTTL(ctx, key, value, 0)
}

func (c *RedisCache) SetWithTTL(ctx context.Context, key string, value json.RawMessage, ttl time.Duration) error {
	if c.client == nil {
		return nil
	}

	expiration := c.ttl
	if ttl > 0 {
		expiration = ttl
	}
	if expiration <= 0 {
		expiration = time.Minute
	}

	if err := c.client.Set(ctx, key, []byte(value), expiration).Err(); err != nil {
		return nil
	}

	return nil
}

func (c *RedisCache) DeleteByPrefix(ctx context.Context, prefix string) error {
	if c.client == nil || prefix == "" {
		return nil
	}

	var cursor uint64
	pattern := prefix + "*"

	for {
		keys, nextCursor, err := c.client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil
		}
		if len(keys) > 0 {
			if err := c.client.Del(ctx, keys...).Err(); err != nil {
				return nil
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return nil
}

func (c *RedisCache) Close() error {
	if c.client == nil {
		return nil
	}

	return c.client.Close()
}
