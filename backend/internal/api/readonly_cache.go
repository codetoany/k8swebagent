package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	readonlyMetricsTTL   = 15 * time.Second
	readonlyDefaultTTL   = 20 * time.Second
	readonlyEventsTTL    = 10 * time.Second
	readonlyNamespaceTTL = 30 * time.Second
)

func (h *handler) respondWithCachedPayload(
	w http.ResponseWriter,
	r *http.Request,
	cacheFragment string,
	ttl time.Duration,
	load func(context.Context) (json.RawMessage, error),
) error {
	payload, err := h.cachedPayload(r.Context(), cacheFragment, ttl, load)
	if err != nil {
		return err
	}

	writeRawJSON(w, http.StatusOK, payload)
	return nil
}

func (h *handler) cachedPayload(
	ctx context.Context,
	cacheFragment string,
	ttl time.Duration,
	load func(context.Context) (json.RawMessage, error),
) (json.RawMessage, error) {
	cacheKey, ok, err := h.readonlyCacheKey(ctx, cacheFragment)
	if err != nil {
		return nil, err
	}

	if ok && h.redisCache != nil {
		cached, found, err := h.redisCache.Get(ctx, cacheKey)
		if err == nil && found {
			return cached, nil
		}
	}

	payload, err := load(ctx)
	if err != nil {
		return nil, err
	}

	if ok && h.redisCache != nil {
		_ = h.redisCache.SetWithTTL(ctx, cacheKey, payload, ttl)
	}

	return payload, nil
}

func (h *handler) readonlyCacheKey(ctx context.Context, cacheFragment string) (string, bool, error) {
	if h.redisCache == nil {
		return "", false, nil
	}

	cluster, err := h.clusterStore.GetDefault(ctx)
	if err != nil {
		return "", false, err
	}
	if cluster == nil {
		return fmt.Sprintf("readonly:snapshot:%s", cacheFragment), true, nil
	}
	if !cluster.IsEnabled {
		return fmt.Sprintf("readonly:disabled:%s:%s", cluster.ID, cacheFragment), true, nil
	}

	return fmt.Sprintf("readonly:%s:%s", cluster.ID, cacheFragment), true, nil
}
