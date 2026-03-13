package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

type handler struct {
	store       *store.SnapshotStore
	cacheStatus func() string
}

type routeHandler func(http.ResponseWriter, *http.Request) error

type namedMeta struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

func NewRouter(snapshotStore *store.SnapshotStore, cacheStatus func() string) http.Handler {
	h := &handler{
		store:       snapshotStore,
		cacheStatus: cacheStatus,
	}

	router := chi.NewRouter()
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		MaxAge:         300,
	}))

	router.Get("/api/health", h.wrap(h.health))

	router.Route("/api/auth", func(r chi.Router) {
		r.Get("/user-info", h.wrap(h.snapshot("auth", "user-info")))
	})

	router.Route("/api/dashboard", func(r chi.Router) {
		r.Get("/overview", h.wrap(h.snapshot("dashboard", "overview")))
		r.Get("/resource-usage", h.wrap(h.snapshot("dashboard", "resource-usage")))
		r.Get("/recent-events", h.wrap(h.snapshot("dashboard", "recent-events")))
		r.Get("/namespace-distribution", h.wrap(h.snapshot("dashboard", "namespace-distribution")))
	})

	router.Route("/api/nodes", func(r chi.Router) {
		r.Get("/", h.wrap(h.list("nodes", "list")))
		r.Get("/{name}/metrics", h.wrap(h.nodesMetrics))
		r.Get("/{name}", h.wrap(h.nodeDetail))
	})

	router.Route("/api/pods", func(r chi.Router) {
		r.Get("/", h.wrap(h.list("pods", "list")))
		r.Get("/{namespace}/{name}/logs", h.wrap(h.podLogs))
		r.Get("/{namespace}/{name}/metrics", h.wrap(h.podMetrics))
		r.Get("/{namespace}/{name}", h.wrap(h.podDetail))
	})

	router.Route("/api", func(r chi.Router) {
		h.registerReadOnlyResource(r, "deployments")
		h.registerReadOnlyResource(r, "statefulsets")
		h.registerReadOnlyResource(r, "daemonsets")
		h.registerReadOnlyResource(r, "cronjobs")
	})

	router.Route("/api/namespaces", func(r chi.Router) {
		r.Get("/", h.wrap(h.list("namespaces", "list")))
		r.Get("/{name}", h.wrap(h.namespaceDetail))
	})

	router.Route("/api/settings", func(r chi.Router) {
		r.Get("/", h.wrap(h.snapshot("settings", "system")))
		r.Get("/ai-models", h.wrap(h.snapshot("settings", "ai-models")))
	})

	router.Route("/api/ai-diagnosis", func(r chi.Router) {
		r.Get("/history", h.wrap(h.snapshot("ai-diagnosis", "history")))
		r.Get("/node-status", h.wrap(h.snapshot("ai-diagnosis", "node-status")))
	})

	return router
}

func (h *handler) wrap(next routeHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := next(w, r); err != nil {
			log.Printf("request failed %s %s: %v", r.Method, r.URL.Path, err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"message": "Internal server error",
			})
		}
	}
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.store.Ping(ctx); err != nil {
		return err
	}

	redisStatus := "disabled"
	if h.cacheStatus != nil {
		redisStatus = h.cacheStatus()
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":   "ok",
		"database": "up",
		"redis":    redisStatus,
	})
	return nil
}

func (h *handler) snapshot(scope string, key string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		payload, err := h.store.Get(r.Context(), scope, key)
		if err != nil {
			return err
		}
		if payload == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{
				"message": fmt.Sprintf("Snapshot not found for %s/%s", scope, key),
			})
			return nil
		}

		writeRawJSON(w, http.StatusOK, payload)
		return nil
	}
}

func (h *handler) list(scope string, key string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		payload, err := h.store.Get(r.Context(), scope, key)
		if err != nil {
			return err
		}
		if payload == nil {
			payload = json.RawMessage("[]")
		}

		writeRawJSON(w, http.StatusOK, payload)
		return nil
	}
}

func (h *handler) nodesMetrics(w http.ResponseWriter, r *http.Request) error {
	metricKey := chi.URLParam(r, "name")
	message := fmt.Sprintf("Node metrics not found for %s", metricKey)
	return h.mapEntry(w, r, "nodes", "metrics", metricKey, message, false)
}

func (h *handler) nodeDetail(w http.ResponseWriter, r *http.Request) error {
	name := chi.URLParam(r, "name")
	payload, err := h.findListItemByName(r.Context(), "nodes", "list", name)
	if err != nil {
		return err
	}
	if payload == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"message": fmt.Sprintf("Node not found: %s", name),
		})
		return nil
	}

	writeRawJSON(w, http.StatusOK, payload)
	return nil
}

func (h *handler) podLogs(w http.ResponseWriter, r *http.Request) error {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	entryKey := fmt.Sprintf("%s/%s", namespace, name)
	return h.mapEntry(w, r, "pods", "logs", entryKey, "", true)
}

func (h *handler) podMetrics(w http.ResponseWriter, r *http.Request) error {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	entryKey := fmt.Sprintf("%s/%s", namespace, name)
	message := fmt.Sprintf("Pod metrics not found for %s", entryKey)
	return h.mapEntry(w, r, "pods", "metrics", entryKey, message, false)
}

func (h *handler) podDetail(w http.ResponseWriter, r *http.Request) error {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	payload, err := h.findListItemByNamespaceAndName(r.Context(), "pods", "list", namespace, name)
	if err != nil {
		return err
	}
	if payload == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"message": fmt.Sprintf("Pod not found: %s/%s", namespace, name),
		})
		return nil
	}

	writeRawJSON(w, http.StatusOK, payload)
	return nil
}

func (h *handler) namespaceDetail(w http.ResponseWriter, r *http.Request) error {
	name := chi.URLParam(r, "name")
	payload, err := h.findListItemByName(r.Context(), "namespaces", "list", name)
	if err != nil {
		return err
	}
	if payload == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"message": fmt.Sprintf("Namespace not found: %s", name),
		})
		return nil
	}

	writeRawJSON(w, http.StatusOK, payload)
	return nil
}

func (h *handler) registerReadOnlyResource(r chi.Router, scope string) {
	r.Get("/"+scope, h.wrap(h.list(scope, "list")))
	r.Get("/"+scope+"/{namespace}/{name}", h.wrap(func(w http.ResponseWriter, r *http.Request) error {
		namespace := chi.URLParam(r, "namespace")
		name := chi.URLParam(r, "name")
		payload, err := h.findListItemByNamespaceAndName(r.Context(), scope, "list", namespace, name)
		if err != nil {
			return err
		}
		if payload == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{
				"message": fmt.Sprintf("%s not found: %s/%s", scope, namespace, name),
			})
			return nil
		}

		writeRawJSON(w, http.StatusOK, payload)
		return nil
	}))
}

func (h *handler) mapEntry(
	w http.ResponseWriter,
	r *http.Request,
	scope string,
	key string,
	entryKey string,
	notFoundMessage string,
	emptyArrayWhenMissing bool,
) error {
	payload, err := h.store.Get(r.Context(), scope, key)
	if err != nil {
		return err
	}
	if payload == nil {
		if emptyArrayWhenMissing {
			writeRawJSON(w, http.StatusOK, json.RawMessage("[]"))
			return nil
		}

		writeJSON(w, http.StatusNotFound, map[string]string{"message": notFoundMessage})
		return nil
	}

	var values map[string]json.RawMessage
	if err := json.Unmarshal(payload, &values); err != nil {
		return err
	}

	entry, found := values[entryKey]
	if !found || isNullJSON(entry) {
		if emptyArrayWhenMissing {
			writeRawJSON(w, http.StatusOK, json.RawMessage("[]"))
			return nil
		}

		writeJSON(w, http.StatusNotFound, map[string]string{"message": notFoundMessage})
		return nil
	}

	writeRawJSON(w, http.StatusOK, entry)
	return nil
}

func (h *handler) findListItemByName(ctx context.Context, scope string, key string, name string) (json.RawMessage, error) {
	payload, err := h.store.Get(ctx, scope, key)
	if err != nil || payload == nil {
		return payload, err
	}

	return findListItem(payload, func(meta namedMeta) bool {
		return meta.Name == name
	})
}

func (h *handler) findListItemByNamespaceAndName(
	ctx context.Context,
	scope string,
	key string,
	namespace string,
	name string,
) (json.RawMessage, error) {
	payload, err := h.store.Get(ctx, scope, key)
	if err != nil || payload == nil {
		return payload, err
	}

	return findListItem(payload, func(meta namedMeta) bool {
		return meta.Namespace == namespace && meta.Name == name
	})
}

func findListItem(payload json.RawMessage, match func(namedMeta) bool) (json.RawMessage, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	for _, item := range items {
		var meta namedMeta
		if err := json.Unmarshal(item, &meta); err != nil {
			return nil, err
		}
		if match(meta) {
			return item, nil
		}
	}

	return nil, nil
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, `{"message":"Internal server error"}`, http.StatusInternalServerError)
		return
	}

	writeRawJSON(w, statusCode, body)
}

func writeRawJSON(w http.ResponseWriter, statusCode int, payload json.RawMessage) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write(payload)
}

func isNullJSON(payload json.RawMessage) bool {
	return strings.TrimSpace(string(payload)) == "null"
}
