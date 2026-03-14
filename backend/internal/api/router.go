package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

type handler struct {
	store        *store.SnapshotStore
	clusterStore *store.ClusterStore
	k8sManager   *k8s.Manager
	cacheStatus  func() string
}

type routeHandler func(http.ResponseWriter, *http.Request) error

type httpError struct {
	status  int
	message string
}

type namedMeta struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

func NewRouter(
	snapshotStore *store.SnapshotStore,
	clusterStore *store.ClusterStore,
	k8sManager *k8s.Manager,
	cacheStatus func() string,
) http.Handler {
	h := &handler{
		store:        snapshotStore,
		clusterStore: clusterStore,
		k8sManager:   k8sManager,
		cacheStatus:  cacheStatus,
	}

	router := chi.NewRouter()
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		MaxAge:         300,
	}))

	router.Get("/api/health", h.wrap(h.health))

	router.Route("/api/clusters", func(r chi.Router) {
		r.Get("/", h.wrap(h.listClusters))
		r.Get("/default", h.wrap(h.defaultCluster))
		r.Post("/", h.wrap(h.createCluster))
		r.Put("/{id}", h.wrap(h.updateCluster))
		r.Post("/{id}/test", h.wrap(h.testCluster))
	})

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
			var requestErr *httpError
			if errors.As(err, &requestErr) {
				writeJSON(w, requestErr.status, map[string]string{
					"message": requestErr.message,
				})
				return
			}

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

	k8sStatus, err := h.k8sManager.CheckDefaultCluster(ctx)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"database": "up",
		"redis":    redisStatus,
		"k8s":      k8sStatus,
	})
	return nil
}

func (h *handler) listClusters(w http.ResponseWriter, r *http.Request) error {
	clusters, err := h.clusterStore.List(r.Context())
	if err != nil {
		return err
	}

	response := make([]clusterResponse, 0, len(clusters))
	for _, cluster := range clusters {
		response = append(response, toClusterResponse(cluster))
	}

	writeJSON(w, http.StatusOK, response)
	return nil
}

func (h *handler) defaultCluster(w http.ResponseWriter, r *http.Request) error {
	cluster, err := h.clusterStore.GetDefault(r.Context())
	if err != nil {
		return err
	}
	if cluster == nil {
		return newHTTPError(http.StatusNotFound, "No default cluster configured")
	}

	writeJSON(w, http.StatusOK, toClusterResponse(*cluster))
	return nil
}

func (h *handler) createCluster(w http.ResponseWriter, r *http.Request) error {
	var payload clusterPayload
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	cluster, err := mergeClusterPayload(nil, payload)
	if err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	saved, err := h.clusterStore.Save(r.Context(), cluster)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusCreated, toClusterResponse(*saved))
	return nil
}

func (h *handler) updateCluster(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	existing, err := h.clusterStore.GetByID(r.Context(), id)
	if err != nil {
		return err
	}
	if existing == nil {
		return newHTTPError(http.StatusNotFound, "Cluster not found")
	}

	var payload clusterPayload
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	cluster, err := mergeClusterPayload(existing, payload)
	if err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	saved, err := h.clusterStore.Save(r.Context(), cluster)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, toClusterResponse(*saved))
	return nil
}

func (h *handler) testCluster(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	result, cluster, err := h.k8sManager.CheckClusterByID(r.Context(), id)
	if err != nil {
		return err
	}
	if cluster == nil {
		return newHTTPError(http.StatusNotFound, "Cluster not found")
	}

	var connectedAt *time.Time
	if result.Status == store.ConnectionStatusConnected {
		connectedAt = &result.CheckedAt
	}
	if err := h.clusterStore.UpdateConnectionStatus(
		r.Context(),
		id,
		result.Status,
		result.Message,
		connectedAt,
	); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, result)
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

type clusterPayload struct {
	Name                  *string `json:"name"`
	Mode                  *string `json:"mode"`
	APIServer             *string `json:"apiServer"`
	KubeconfigPath        *string `json:"kubeconfigPath"`
	Kubeconfig            *string `json:"kubeconfig"`
	Token                 *string `json:"token"`
	CAData                *string `json:"caData"`
	InsecureSkipTLSVerify *bool   `json:"insecureSkipTLSVerify"`
	IsDefault             *bool   `json:"isDefault"`
	IsEnabled             *bool   `json:"isEnabled"`
}

type clusterResponse struct {
	ID                    string     `json:"id"`
	Name                  string     `json:"name"`
	Mode                  string     `json:"mode"`
	APIServer             string     `json:"apiServer,omitempty"`
	KubeconfigPath        string     `json:"kubeconfigPath,omitempty"`
	HasKubeconfig         bool       `json:"hasKubeconfig"`
	HasToken              bool       `json:"hasToken"`
	InsecureSkipTLSVerify bool       `json:"insecureSkipTLSVerify"`
	IsDefault             bool       `json:"isDefault"`
	IsEnabled             bool       `json:"isEnabled"`
	LastConnectionStatus  string     `json:"lastConnectionStatus"`
	LastConnectionError   string     `json:"lastConnectionError,omitempty"`
	LastConnectedAt       *time.Time `json:"lastConnectedAt,omitempty"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

func newHTTPError(status int, message string) error {
	return &httpError{status: status, message: message}
}

func (e *httpError) Error() string {
	return e.message
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid request body: %w", err)
	}

	return nil
}

func mergeClusterPayload(existing *store.Cluster, payload clusterPayload) (store.Cluster, error) {
	cluster := store.Cluster{
		IsEnabled:            true,
		LastConnectionStatus: store.ConnectionStatusUnknown,
	}
	if existing != nil {
		cluster = *existing
	}

	if payload.Name != nil {
		cluster.Name = strings.TrimSpace(*payload.Name)
	}
	if payload.Mode != nil {
		cluster.Mode = strings.TrimSpace(*payload.Mode)
	}
	if payload.APIServer != nil {
		cluster.APIServer = strings.TrimSpace(*payload.APIServer)
	}
	if payload.KubeconfigPath != nil {
		cluster.KubeconfigPath = strings.TrimSpace(*payload.KubeconfigPath)
	}
	if payload.Kubeconfig != nil {
		cluster.Kubeconfig = strings.TrimSpace(*payload.Kubeconfig)
	}
	if payload.Token != nil {
		cluster.Token = strings.TrimSpace(*payload.Token)
	}
	if payload.CAData != nil {
		cluster.CAData = strings.TrimSpace(*payload.CAData)
	}
	if payload.InsecureSkipTLSVerify != nil {
		cluster.InsecureSkipTLSVerify = *payload.InsecureSkipTLSVerify
	}
	if payload.IsDefault != nil {
		cluster.IsDefault = *payload.IsDefault
	}
	if payload.IsEnabled != nil {
		cluster.IsEnabled = *payload.IsEnabled
	}

	cluster.LastConnectionStatus = store.ConnectionStatusUnknown
	cluster.LastConnectionError = ""
	cluster.LastConnectedAt = nil

	if cluster.Name == "" {
		return store.Cluster{}, fmt.Errorf("name is required")
	}
	if cluster.Mode == "" {
		return store.Cluster{}, fmt.Errorf("mode is required")
	}

	return cluster, nil
}

func toClusterResponse(cluster store.Cluster) clusterResponse {
	return clusterResponse{
		ID:                    cluster.ID,
		Name:                  cluster.Name,
		Mode:                  cluster.Mode,
		APIServer:             cluster.APIServer,
		KubeconfigPath:        cluster.KubeconfigPath,
		HasKubeconfig:         cluster.Kubeconfig != "" || cluster.KubeconfigPath != "",
		HasToken:              cluster.Token != "",
		InsecureSkipTLSVerify: cluster.InsecureSkipTLSVerify,
		IsDefault:             cluster.IsDefault,
		IsEnabled:             cluster.IsEnabled,
		LastConnectionStatus:  cluster.LastConnectionStatus,
		LastConnectionError:   cluster.LastConnectionError,
		LastConnectedAt:       cluster.LastConnectedAt,
		CreatedAt:             cluster.CreatedAt,
		UpdatedAt:             cluster.UpdatedAt,
	}
}
