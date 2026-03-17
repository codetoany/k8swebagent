package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"k8s-agent-backend/internal/cache"
	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/service"
	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
)

type handler struct {
	store              *store.SnapshotStore
	settingsStore      *store.SettingsStore
	clusterStore       *store.ClusterStore
	auditStore         *store.AuditStore
	aiHistoryStore     *store.AIConversationStore
	aiTemplateStore    *store.AITemplateStore
	aiMemoryStore      *store.AIMemoryStore
	aiInspectionStore  *store.AIInspectionStore
	aiIssueStore       *store.AIIssueStore
	aiInspectionRunner *AIInspectionRunner
	k8sManager         *k8s.Manager
	redisCache         *cache.RedisCache
	dashboardService   *service.DashboardService
	nodesService       *service.NodesService
	podsService        *service.PodsService
	workloadsService   *service.WorkloadsService
	namespacesService  *service.NamespacesService
	servicesService    *service.ServicesService
	ingressesService   *service.IngressesService
	configMapsService  *service.ConfigMapsService
	secretsService     *service.SecretsService
	storageService     *service.StorageService
	eventsService      *service.EventsService
	yamlService        *service.YAMLService
	applyService       *service.ApplyService
	llmClient          *llmClient
	observability      *observabilityClient
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
	settingsStore *store.SettingsStore,
	clusterStore *store.ClusterStore,
	auditStore *store.AuditStore,
	aiHistoryStore *store.AIConversationStore,
	aiTemplateStore *store.AITemplateStore,
	aiMemoryStore *store.AIMemoryStore,
	aiInspectionStore *store.AIInspectionStore,
	aiIssueStore *store.AIIssueStore,
	aiInspectionRunner *AIInspectionRunner,
	k8sManager *k8s.Manager,
	redisCache *cache.RedisCache,
) http.Handler {
	h := &handler{
		store:              snapshotStore,
		settingsStore:      settingsStore,
		clusterStore:       clusterStore,
		auditStore:         auditStore,
		aiHistoryStore:     aiHistoryStore,
		aiTemplateStore:    aiTemplateStore,
		aiMemoryStore:      aiMemoryStore,
		aiInspectionStore:  aiInspectionStore,
		aiIssueStore:       aiIssueStore,
		aiInspectionRunner: aiInspectionRunner,
		k8sManager:         k8sManager,
		redisCache:         redisCache,
		dashboardService:   service.NewDashboardService(snapshotStore, k8sManager),
		nodesService:       service.NewNodesService(snapshotStore, k8sManager),
		podsService:        service.NewPodsService(snapshotStore, k8sManager),
		workloadsService:   service.NewWorkloadsService(snapshotStore, k8sManager),
		namespacesService:  service.NewNamespacesService(snapshotStore, k8sManager),
		servicesService:    service.NewServicesService(snapshotStore, k8sManager),
		ingressesService:   service.NewIngressesService(snapshotStore, k8sManager),
		configMapsService:  service.NewConfigMapsService(snapshotStore, k8sManager),
		secretsService:     service.NewSecretsService(snapshotStore, k8sManager),
		storageService:     service.NewStorageService(snapshotStore, k8sManager),
		eventsService:      service.NewEventsService(snapshotStore, k8sManager),
		yamlService:        service.NewYAMLService(k8sManager),
		applyService:       service.NewApplyService(k8sManager),
		llmClient:          newLLMClient(90 * time.Second),
		observability:      newObservabilityClient(config.Load().Observability),
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
		r.Delete("/{id}", h.wrap(h.deleteCluster))
		r.Post("/{id}/test", h.wrap(h.testCluster))
	})

	router.Route("/api/auth", func(r chi.Router) {
		r.Get("/user-info", h.wrap(h.snapshot("auth", "user-info")))
	})

	router.Route("/api/audit-logs", func(r chi.Router) {
		r.Get("/", h.wrap(h.listAuditLogs))
	})

	router.Route("/api/notifications", func(r chi.Router) {
		r.Get("/", h.wrap(h.listNotifications))
		r.Post("/read-all", h.wrap(h.markAllNotificationsRead))
	})

	router.Route("/api/dashboard", func(r chi.Router) {
		r.Get("/overview", h.wrap(h.dashboardOverview))
		r.Get("/resource-usage", h.wrap(h.dashboardResourceUsage))
		r.Get("/recent-events", h.wrap(h.dashboardRecentEvents))
		r.Get("/namespace-distribution", h.wrap(h.dashboardNamespaceDistribution))
	})

	router.Route("/api/nodes", func(r chi.Router) {
		r.Get("/", h.wrap(h.listNodes))
		r.Post("/{name}/cordon", h.wrap(h.cordonNode))
		r.Post("/{name}/uncordon", h.wrap(h.uncordonNode))
		r.Post("/{name}/maintenance/enable", h.wrap(h.enableNodeMaintenance))
		r.Post("/{name}/maintenance/disable", h.wrap(h.disableNodeMaintenance))
		r.Get("/{name}/metrics", h.wrap(h.nodesMetrics))
		r.Get("/{name}", h.wrap(h.nodeDetail))
	})

	router.Route("/api/pods", func(r chi.Router) {
		r.Get("/", h.wrap(h.listPods))
		r.Post("/{namespace}/{name}/restart", h.wrap(h.restartPod))
		r.Get("/{namespace}/{name}/logs", h.wrap(h.podLogs))
		r.Get("/{namespace}/{name}/metrics", h.wrap(h.podMetrics))
		r.Post("/{namespace}/{name}/exec", h.podExec)
		r.Get("/{namespace}/{name}", h.wrap(h.podDetail))
		r.Delete("/{namespace}/{name}", h.wrap(h.deletePod))
	})

	router.Route("/api", func(r chi.Router) {
		r.Get("/deployments", h.wrap(h.listWorkload("deployments")))
		r.Get("/deployments/{namespace}/{name}", h.wrap(h.workloadDetail("deployments")))
		r.Post("/deployments/{namespace}/{name}/scale", h.wrap(h.scaleWorkload("deployments")))
		r.Post("/deployments/{namespace}/{name}/restart", h.wrap(h.restartWorkload("deployments")))
		r.Post("/deployments/{namespace}/{name}/pause", h.wrap(h.setWorkloadPaused("deployments", true)))
		r.Post("/deployments/{namespace}/{name}/resume", h.wrap(h.setWorkloadPaused("deployments", false)))
		r.Delete("/deployments/{namespace}/{name}", h.wrap(h.deleteWorkload("deployments")))
		r.Get("/statefulsets", h.wrap(h.listWorkload("statefulsets")))
		r.Get("/statefulsets/{namespace}/{name}", h.wrap(h.workloadDetail("statefulsets")))
		r.Post("/statefulsets/{namespace}/{name}/scale", h.wrap(h.scaleWorkload("statefulsets")))
		r.Post("/statefulsets/{namespace}/{name}/restart", h.wrap(h.restartWorkload("statefulsets")))
		r.Delete("/statefulsets/{namespace}/{name}", h.wrap(h.deleteWorkload("statefulsets")))
		r.Get("/daemonsets", h.wrap(h.listWorkload("daemonsets")))
		r.Get("/daemonsets/{namespace}/{name}", h.wrap(h.workloadDetail("daemonsets")))
		r.Post("/daemonsets/{namespace}/{name}/restart", h.wrap(h.restartWorkload("daemonsets")))
		r.Delete("/daemonsets/{namespace}/{name}", h.wrap(h.deleteWorkload("daemonsets")))
		r.Get("/cronjobs", h.wrap(h.listWorkload("cronjobs")))
		r.Get("/cronjobs/{namespace}/{name}", h.wrap(h.workloadDetail("cronjobs")))
		r.Delete("/cronjobs/{namespace}/{name}", h.wrap(h.deleteWorkload("cronjobs")))
		r.Get("/jobs", h.wrap(h.listWorkload("jobs")))
		r.Get("/jobs/{namespace}/{name}", h.wrap(h.workloadDetail("jobs")))
		r.Delete("/jobs/{namespace}/{name}", h.wrap(h.deleteWorkload("jobs")))
	})

	router.Route("/api/namespaces", func(r chi.Router) {
		r.Get("/", h.wrap(h.listNamespaces))
		r.Get("/{name}", h.wrap(h.namespaceDetail))
	})

	router.Route("/api/services", func(r chi.Router) {
		r.Get("/", h.wrap(h.listServices))
		r.Get("/{namespace}/{name}", h.wrap(h.serviceDetail))
		r.Delete("/{namespace}/{name}", h.wrap(h.deleteService))
	})

	router.Route("/api/ingresses", func(r chi.Router) {
		r.Get("/", h.wrap(h.listIngresses))
		r.Get("/{namespace}/{name}", h.wrap(h.ingressDetail))
		r.Delete("/{namespace}/{name}", h.wrap(h.deleteIngress))
	})

	router.Route("/api/configmaps", func(r chi.Router) {
		r.Get("/", h.wrap(h.listConfigMaps))
		r.Get("/{namespace}/{name}", h.wrap(h.configMapDetail))
		r.Delete("/{namespace}/{name}", h.wrap(h.deleteConfigMap))
	})

	router.Route("/api/secrets", func(r chi.Router) {
		r.Get("/", h.wrap(h.listSecrets))
		r.Get("/{namespace}/{name}", h.wrap(h.secretDetail))
	})

	router.Route("/api/pvcs", func(r chi.Router) {
		r.Get("/", h.wrap(h.listPVCs))
		r.Get("/{namespace}/{name}", h.wrap(h.pvcDetail))
	})

	router.Route("/api/pvs", func(r chi.Router) {
		r.Get("/", h.wrap(h.listPVs))
		r.Get("/{name}", h.wrap(h.pvDetail))
	})

	router.Route("/api/storageclasses", func(r chi.Router) {
		r.Get("/", h.wrap(h.listStorageClasses))
		r.Get("/{name}", h.wrap(h.storageClassDetail))
	})

	router.Route("/api/events", func(r chi.Router) {
		r.Get("/", h.wrap(h.listEvents))
	})

	router.Route("/api/yaml", func(r chi.Router) {
		r.Get("/", h.wrap(h.yamlDetail))
	})

	router.Post("/api/apply", h.wrap(h.applyYAML))

	router.Route("/api/settings", func(r chi.Router) {
		r.Get("/", h.wrap(h.getSettings))
		r.Put("/", h.wrap(h.updateSettings))
		r.Get("/notifications", h.wrap(h.getNotificationSettings))
		r.Put("/notifications", h.wrap(h.updateNotificationSettings))
		r.Get("/ai-models", h.wrap(h.getAIModels))
		r.Put("/ai-models", h.wrap(h.updateAIModels))
	})

	router.Route("/api/ai-diagnosis", func(r chi.Router) {
		r.Get("/templates", h.wrap(h.listAIDiagnosisTemplates))
		r.Post("/templates", h.wrap(h.createAIDiagnosisTemplate))
		r.Put("/templates/{id}", h.wrap(h.updateAIDiagnosisTemplate))
		r.Delete("/templates/{id}", h.wrap(h.deleteAIDiagnosisTemplate))
		r.Get("/history", h.wrap(h.listAIDiagnosisHistory))
		r.Get("/history/{id}", h.wrap(h.getAIDiagnosisConversation))
		r.Delete("/history/{id}", h.wrap(h.deleteAIDiagnosisConversation))
		r.Get("/inspections", h.wrap(h.listAIInspections))
		r.Get("/inspections/latest", h.wrap(h.latestAIInspection))
		r.Post("/inspections/run", h.wrap(h.runAIInspection))
		r.Get("/issues", h.wrap(h.listAIIssues))
		r.Get("/issues/{id}", h.wrap(h.getAIIssue))
		r.Post("/issues/{id}/acknowledge", h.wrap(h.acknowledgeAIIssue))
		r.Post("/issues/{id}/silence", h.wrap(h.silenceAIIssue))
		r.Post("/issues/{id}/escalate", h.wrap(h.escalateAIIssue))
		r.Post("/issues/{id}/follow", h.wrap(h.followAIIssue))
		r.Post("/issues/{id}/resolve", h.wrap(h.resolveAIIssue))
		r.Post("/follow-up-recheck", h.wrap(h.runAIFollowUpRecheck))
		r.Get("/risk-summary", h.wrap(h.aiRiskSummary))
		r.Get("/multi-cluster-summary", h.wrap(h.aiMultiClusterSummary))
		r.Get("/metrics/history", h.wrap(h.aiMetricsHistory))
		r.Get("/logs/aggregate", h.wrap(h.aiAggregatedLogs))
		r.Get("/memory", h.wrap(h.listAIMemories))
		r.Get("/memory/resource", h.wrap(h.listAIMemoriesByResource))
		r.Post("/memory/feedback", h.wrap(h.saveAIMemoryFeedback))
		r.Post("/chat", h.wrap(h.aiDiagnosisChat))
		r.Post("/chat/stream", h.wrap(h.aiDiagnosisChatStream))
		r.Get("/node-status", h.wrap(h.aiDiagnosisNodeStatus))
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

			if errors.Is(err, k8s.ErrClusterNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{
					"message": "Cluster not found",
				})
				return
			}

			if status, message, ok := translateUpstreamError(err); ok {
				log.Printf("request failed %s %s: %v", r.Method, r.URL.Path, err)
				writeJSON(w, status, map[string]string{
					"message": message,
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

func (h *handler) yamlDetail(w http.ResponseWriter, r *http.Request) error {
	kind := r.URL.Query().Get("kind")
	version := r.URL.Query().Get("version")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")

	if kind == "" || version == "" || name == "" {
		return newHTTPError(http.StatusBadRequest, "Missing required query parameters: kind, version, name")
	}

	payload, err := h.yamlService.GetResourceYAML(r.Context(), requestedClusterID(r), kind, version, namespace, name)
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(payload)
	return err
}

// applyYAML 处理 POST /api/apply
func (h *handler) applyYAML(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := decodeJSON(r, &body); err != nil {
		return newHTTPError(http.StatusBadRequest, "无效的请求体")
	}
	if strings.TrimSpace(body.YAML) == "" {
		return newHTTPError(http.StatusBadRequest, "yaml 字段不能为空")
	}

	payload, err := h.applyService.ApplyYAML(r.Context(), requestedClusterID(r), body.YAML)
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	_, err = w.Write(payload)
	return err
}

// podExec 处理 GET /api/pods/{namespace}/{name}/exec (WebSocket)
func (h *handler) podExec(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	clusterID := requestedClusterID(r)

	// 执行 exec 流
	if err := execPodStream(r.Context(), h.k8sManager, clusterID, namespace, name, container, w, r); err != nil {
		log.Printf("pod exec error %s/%s: %v", namespace, name, err)
	}
}

func translateUpstreamError(err error) (int, string, bool) {
	if err == nil {
		return 0, "", false
	}

	if k8serrors.IsUnauthorized(err) {
		return http.StatusBadGateway, "集群认证失败，请更新集群 Token 或 kubeconfig", true
	}
	if k8serrors.IsForbidden(err) {
		return http.StatusForbidden, "集群账号权限不足，请检查 RBAC 授权", true
	}

	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "provide credentials"),
		strings.Contains(lower, "unauthorized"):
		return http.StatusBadGateway, "集群认证失败，请更新集群 Token 或 kubeconfig", true
	case strings.Contains(lower, "forbidden"):
		return http.StatusForbidden, "集群账号权限不足，请检查 RBAC 授权", true
	default:
		return 0, "", false
	}
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.store.Ping(ctx); err != nil {
		return err
	}

	redisStatus := "disabled"
	if h.redisCache != nil {
		redisStatus = h.redisCache.Status()
	}

	k8sStatus, err := h.k8sManager.CheckClusterSelection(ctx, requestedClusterID(r))
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
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.create",
			ResourceType: "cluster",
			ResourceName: cluster.Name,
			ClusterID:    cluster.ID,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "cluster.create",
		ResourceType: "cluster",
		ResourceName: saved.Name,
		ClusterID:    saved.ID,
		ClusterName:  saved.Name,
		Status:       store.AuditStatusSuccess,
		Message:      "Cluster configuration saved",
	})
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
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.update",
			ResourceType: "cluster",
			ResourceName: cluster.Name,
			ClusterID:    cluster.ID,
			ClusterName:  cluster.Name,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "cluster.update",
		ResourceType: "cluster",
		ResourceName: saved.Name,
		ClusterID:    saved.ID,
		ClusterName:  saved.Name,
		Status:       store.AuditStatusSuccess,
		Message:      "Cluster configuration updated",
	})
	writeJSON(w, http.StatusOK, toClusterResponse(*saved))
	return nil
}

func (h *handler) deleteCluster(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	existing, err := h.clusterStore.GetByID(r.Context(), id)
	if err != nil {
		return err
	}
	if existing == nil {
		return newHTTPError(http.StatusNotFound, "Cluster not found")
	}

	if err := h.clusterStore.Delete(r.Context(), id); err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.delete",
			ResourceType: "cluster",
			ResourceName: existing.Name,
			ClusterID:    existing.ID,
			ClusterName:  existing.Name,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "cluster.delete",
		ResourceType: "cluster",
		ResourceName: existing.Name,
		ClusterID:    existing.ID,
		ClusterName:  existing.Name,
		Status:       store.AuditStatusSuccess,
		Message:      "Cluster configuration deleted",
	})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *handler) testCluster(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	result, cluster, err := h.k8sManager.CheckClusterByID(r.Context(), id)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.test",
			ResourceType: "cluster",
			ResourceName: id,
			ClusterID:    id,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
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
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.test",
			ResourceType: "cluster",
			ResourceName: cluster.Name,
			ClusterID:    cluster.ID,
			ClusterName:  cluster.Name,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		return err
	}

	status := store.AuditStatusFailed
	if result.Status == store.ConnectionStatusConnected {
		status = store.AuditStatusSuccess
	}
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "cluster.test",
		ResourceType: "cluster",
		ResourceName: cluster.Name,
		ClusterID:    cluster.ID,
		ClusterName:  cluster.Name,
		Status:       status,
		Message:      strings.TrimSpace(result.Message),
		Details: map[string]any{
			"serverVersion": result.ServerVersion,
		},
	})
	writeJSON(w, http.StatusOK, result)
	return nil
}

func (h *handler) listAuditLogs(w http.ResponseWriter, r *http.Request) error {
	if h.auditStore == nil {
		writeJSON(w, http.StatusOK, store.AuditLogListResult{
			Items:    []store.AuditLogEntry{},
			Total:    0,
			Page:     1,
			PageSize: 10,
		})
		return nil
	}

	result, err := h.auditStore.List(r.Context(), store.AuditLogFilter{
		ClusterID:    strings.TrimSpace(r.URL.Query().Get("clusterId")),
		Status:       store.AuditStatus(strings.TrimSpace(r.URL.Query().Get("status"))),
		Action:       strings.TrimSpace(r.URL.Query().Get("action")),
		ResourceType: strings.TrimSpace(r.URL.Query().Get("resourceType")),
		Query:        strings.TrimSpace(r.URL.Query().Get("query")),
		Page:         requestedPage(r, 1),
		PageSize:     requestedLimit(r, 10),
	})
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, result)
	return nil
}

func (h *handler) listNotifications(w http.ResponseWriter, r *http.Request) error {
	settings, err := h.currentSystemSettings(r.Context())
	if err != nil {
		return err
	}

	state, err := h.currentNotificationState(r.Context())
	if err != nil {
		return err
	}

	if settings.Notifications.Level == "none" {
		writeJSON(w, http.StatusOK, notificationListResponse{
			Items:       []notificationItemResponse{},
			UnreadCount: 0,
			Total:       0,
			LastReadAt:  state.LastReadAt,
		})
		return nil
	}

	clusterID := strings.TrimSpace(r.URL.Query().Get("clusterId"))

	audits := store.AuditLogListResult{Items: []store.AuditLogEntry{}}
	if h.auditStore != nil {
		auditResult, auditErr := h.auditStore.List(r.Context(), store.AuditLogFilter{
			ClusterID: clusterID,
			Page:      1,
			PageSize:  100,
		})
		if auditErr != nil {
			return auditErr
		}
		audits = *auditResult
	}

	issues := store.AIIssueListResult{Items: []store.AIIssue{}}
	if h.aiIssueStore != nil {
		issueResult, issueErr := h.aiIssueStore.List(r.Context(), store.AIIssueFilter{
			ClusterID: clusterID,
			Page:      1,
			PageSize:  100,
		})
		if issueErr != nil {
			return issueErr
		}
		issues = *issueResult
	}

	limit := requestedLimit(r, 12)
	notifications, unreadCount, total := buildNotifications(audits.Items, issues.Items, settings.Notifications, state.LastReadAt, limit)

	writeJSON(w, http.StatusOK, notificationListResponse{
		Items:       notifications,
		UnreadCount: unreadCount,
		Total:       total,
		LastReadAt:  state.LastReadAt,
	})
	return nil
}

func (h *handler) markAllNotificationsRead(w http.ResponseWriter, r *http.Request) error {
	state := notificationStateDocument{
		LastReadAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := h.saveNotificationState(r.Context(), state); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, state)
	return nil
}

func (h *handler) getSettings(w http.ResponseWriter, r *http.Request) error {
	settings, err := h.currentSystemSettings(r.Context())
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, settings)
	return nil
}

func (h *handler) updateSettings(w http.ResponseWriter, r *http.Request) error {
	settings, err := h.currentSystemSettings(r.Context())
	if err != nil {
		return err
	}

	var payload systemSettingsPayload
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, "无效的请求参数")
	}

	merged := mergeSystemSettings(settings, payload)
	normalized, err := normalizeSystemSettings(merged)
	if err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.saveSystemSettings(r.Context(), normalized); err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "settings.update",
		ResourceType: "settings",
		ResourceName: "system",
		Status:       store.AuditStatusSuccess,
		Message:      "System settings updated",
	})

	writeJSON(w, http.StatusOK, normalized)
	return nil
}

func (h *handler) getNotificationSettings(w http.ResponseWriter, r *http.Request) error {
	settings, err := h.currentSystemSettings(r.Context())
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, settings.Notifications)
	return nil
}

func (h *handler) updateNotificationSettings(w http.ResponseWriter, r *http.Request) error {
	settings, err := h.currentSystemSettings(r.Context())
	if err != nil {
		return err
	}

	var payload notificationSettingsPayload
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, "无效的请求参数")
	}

	settings.Notifications = mergeNotificationSettings(settings.Notifications, payload)
	normalized, err := normalizeSystemSettings(settings)
	if err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.saveSystemSettings(r.Context(), normalized); err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "settings.notifications.update",
		ResourceType: "settings",
		ResourceName: "notifications",
		Status:       store.AuditStatusSuccess,
		Message:      "Notification settings updated",
	})

	writeJSON(w, http.StatusOK, normalized.Notifications)
	return nil
}

func (h *handler) getAIModels(w http.ResponseWriter, r *http.Request) error {
	models, err := h.currentAIModels(r.Context())
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, redactAIModels(models))
	return nil
}

func (h *handler) updateAIModels(w http.ResponseWriter, r *http.Request) error {
	var payload []aiModelPayload
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, "无效的请求参数")
	}

	existingModels, err := h.currentAIModels(r.Context())
	if err != nil {
		return err
	}

	models, err := normalizeAIModels(mergeAIModelSecrets(payload, existingModels))
	if err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.saveAIModels(r.Context(), models); err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "settings.ai-models.update",
		ResourceType: "settings",
		ResourceName: "ai-models",
		Status:       store.AuditStatusSuccess,
		Message:      "AI model settings updated",
		Details: map[string]any{
			"count": len(models),
		},
	})

	writeJSON(w, http.StatusOK, redactAIModels(models))
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

func (h *handler) listNodes(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "nodes:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.nodesService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) dashboardOverview(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "dashboard:overview", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.dashboardService.OverviewPayload(ctx, clusterID)
	})
}

func (h *handler) dashboardResourceUsage(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	resourceRange := requestedDashboardRange(r)
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("dashboard:resource-usage:%s", resourceRange), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.dashboardService.ResourceUsagePayload(ctx, clusterID, resourceRange)
	})
}

func (h *handler) dashboardNamespaceDistribution(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "dashboard:namespace-distribution", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.dashboardService.NamespaceDistributionPayload(ctx, clusterID)
	})
}

func (h *handler) dashboardRecentEvents(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "dashboard:recent-events", readonlyEventsTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.dashboardService.RecentEventsPayload(ctx, clusterID)
	})
}

func (h *handler) listPods(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "pods:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.podsService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) listNamespaces(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "namespaces:list", readonlyNamespaceTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.namespacesService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) listWorkload(scope string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		clusterID := requestedClusterID(r)
		return h.respondWithCachedPayload(w, r, fmt.Sprintf("workloads:%s:list", scope), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
			return h.workloadsService.ListPayload(ctx, clusterID, scope)
		})
	}
}

func (h *handler) workloadDetail(scope string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		clusterID := requestedClusterID(r)
		namespace := chi.URLParam(r, "namespace")
		name := chi.URLParam(r, "name")
		return h.respondWithCachedPayload(w, r, fmt.Sprintf("workloads:%s:detail:%s:%s", scope, namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
			payload, err := h.workloadsService.DetailPayload(ctx, clusterID, scope, namespace, name)
			if err != nil {
				if errors.Is(err, service.ErrWorkloadNotFound) {
					return nil, newHTTPError(http.StatusNotFound, service.WorkloadNotFoundMessage(scope, namespace, name))
				}
				return nil, err
			}

			return payload, nil
		})
	}
}

func (h *handler) scaleWorkload(scope string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		var payload workloadScalePayload
		if err := decodeJSON(r, &payload); err != nil {
			return newHTTPError(http.StatusBadRequest, "无效的请求参数")
		}
		if payload.Replicas == nil || *payload.Replicas < 0 {
			return newHTTPError(http.StatusBadRequest, "副本数必须大于或等于 0")
		}

		clusterID := requestedClusterID(r)
		namespace := chi.URLParam(r, "namespace")
		name := chi.URLParam(r, "name")
		item, err := h.workloadsService.Scale(r.Context(), clusterID, scope, namespace, name, *payload.Replicas)
		if err != nil {
			h.recordAudit(r.Context(), r, store.AuditLogInput{
				Action:       "workload.scale",
				ResourceType: scope,
				ResourceName: name,
				Namespace:    namespace,
				ClusterID:    clusterID,
				Status:       store.AuditStatusFailed,
				Message:      errorMessageForAudit(err),
				Details: map[string]any{
					"replicas": *payload.Replicas,
				},
			})
			switch {
			case errors.Is(err, service.ErrWorkloadNotFound):
				return newHTTPError(http.StatusNotFound, service.WorkloadNotFoundMessage(scope, namespace, name))
			case errors.Is(err, service.ErrWorkloadActionUnsupported):
				return newHTTPError(http.StatusBadRequest, "当前工作负载类型暂不支持扩缩容")
			case errors.Is(err, service.ErrWorkloadLiveClusterNeeded):
				return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
			default:
				return err
			}
		}

		h.invalidateReadonlyCache(r.Context(), clusterID)
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "workload.scale",
			ResourceType: scope,
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusSuccess,
			Message:      fmt.Sprintf("Scaled to %d replicas", *payload.Replicas),
			Details: map[string]any{
				"replicas": *payload.Replicas,
			},
		})
		writeJSON(w, http.StatusOK, item)
		return nil
	}
}

func (h *handler) restartWorkload(scope string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		clusterID := requestedClusterID(r)
		namespace := chi.URLParam(r, "namespace")
		name := chi.URLParam(r, "name")
		item, err := h.workloadsService.Restart(r.Context(), clusterID, scope, namespace, name)
		if err != nil {
			h.recordAudit(r.Context(), r, store.AuditLogInput{
				Action:       "workload.restart",
				ResourceType: scope,
				ResourceName: name,
				Namespace:    namespace,
				ClusterID:    clusterID,
				Status:       store.AuditStatusFailed,
				Message:      errorMessageForAudit(err),
			})
			switch {
			case errors.Is(err, service.ErrWorkloadNotFound):
				return newHTTPError(http.StatusNotFound, service.WorkloadNotFoundMessage(scope, namespace, name))
			case errors.Is(err, service.ErrWorkloadActionUnsupported):
				return newHTTPError(http.StatusBadRequest, "当前工作负载类型暂不支持重启")
			case errors.Is(err, service.ErrWorkloadLiveClusterNeeded):
				return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
			default:
				return err
			}
		}

		h.invalidateReadonlyCache(r.Context(), clusterID)
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "workload.restart",
			ResourceType: scope,
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusSuccess,
			Message:      "Restart triggered",
		})
		writeJSON(w, http.StatusOK, item)
		return nil
	}
}

func (h *handler) setWorkloadPaused(scope string, paused bool) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		clusterID := requestedClusterID(r)
		namespace := chi.URLParam(r, "namespace")
		name := chi.URLParam(r, "name")
		item, err := h.workloadsService.SetPaused(r.Context(), clusterID, scope, namespace, name, paused)
		if err != nil {
			h.recordAudit(r.Context(), r, store.AuditLogInput{
				Action:       map[bool]string{true: "workload.pause", false: "workload.resume"}[paused],
				ResourceType: scope,
				ResourceName: name,
				Namespace:    namespace,
				ClusterID:    clusterID,
				Status:       store.AuditStatusFailed,
				Message:      errorMessageForAudit(err),
			})
			switch {
			case errors.Is(err, service.ErrWorkloadNotFound):
				return newHTTPError(http.StatusNotFound, service.WorkloadNotFoundMessage(scope, namespace, name))
			case errors.Is(err, service.ErrWorkloadActionUnsupported):
				return newHTTPError(http.StatusBadRequest, "current workload type does not support pause or resume")
			case errors.Is(err, service.ErrWorkloadLiveClusterNeeded):
				return newHTTPError(http.StatusBadRequest, "current cluster is not connected to a live Kubernetes cluster")
			default:
				return err
			}
		}

		h.invalidateReadonlyCache(r.Context(), clusterID)
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       map[bool]string{true: "workload.pause", false: "workload.resume"}[paused],
			ResourceType: scope,
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusSuccess,
			Message:      map[bool]string{true: "Workload paused", false: "Workload resumed"}[paused],
		})
		writeJSON(w, http.StatusOK, item)
		return nil
	}
}

func (h *handler) deleteWorkload(scope string) routeHandler {
	return func(w http.ResponseWriter, r *http.Request) error {
		clusterID := requestedClusterID(r)
		namespace := chi.URLParam(r, "namespace")
		name := chi.URLParam(r, "name")

		if err := h.workloadsService.Delete(r.Context(), clusterID, scope, namespace, name); err != nil {
			h.recordAudit(r.Context(), r, store.AuditLogInput{
				Action:       "workload.delete",
				ResourceType: scope,
				ResourceName: name,
				Namespace:    namespace,
				ClusterID:    clusterID,
				Status:       store.AuditStatusFailed,
				Message:      errorMessageForAudit(err),
			})
			switch {
			case errors.Is(err, service.ErrWorkloadNotFound):
				return newHTTPError(http.StatusNotFound, service.WorkloadNotFoundMessage(scope, namespace, name))
			case errors.Is(err, service.ErrWorkloadActionUnsupported):
				return newHTTPError(http.StatusBadRequest, "current workload type does not support delete")
			case errors.Is(err, service.ErrWorkloadLiveClusterNeeded):
				return newHTTPError(http.StatusBadRequest, "current cluster is not connected to a live Kubernetes cluster")
			default:
				return err
			}
		}

		h.invalidateReadonlyCache(r.Context(), clusterID)
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "workload.delete",
			ResourceType: scope,
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusSuccess,
			Message:      "Workload deleted",
		})
		writeJSON(w, http.StatusOK, map[string]string{
			"message": "Workload deleted",
		})
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
	clusterID := requestedClusterID(r)
	metricKey := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("nodes:metrics:%s", metricKey), readonlyMetricsTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.nodesService.MetricsPayload(ctx, clusterID, metricKey)
		if err != nil {
			if errors.Is(err, service.ErrNodeNotFound) {
				return nil, newHTTPError(http.StatusNotFound, fmt.Sprintf("Node metrics not found for %s", metricKey))
			}
			return nil, err
		}

		return payload, nil
	})
}

func (h *handler) nodeDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("nodes:detail:%s", name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		listPayload, err := h.nodesService.ListPayload(ctx, clusterID)
		if err != nil {
			return nil, err
		}
		payload, err := service.FindNodePayload(listPayload, name)
		if err != nil {
			if errors.Is(err, service.ErrNodeNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.NodeNotFoundMessage(name))
			}
			return nil, err
		}
		if payload == nil {
			return nil, newHTTPError(http.StatusNotFound, service.NodeNotFoundMessage(name))
		}

		return payload, nil
	})
}

func (h *handler) cordonNode(w http.ResponseWriter, r *http.Request) error {
	return h.setNodeSchedulable(w, r, false)
}

func (h *handler) uncordonNode(w http.ResponseWriter, r *http.Request) error {
	return h.setNodeSchedulable(w, r, true)
}

func (h *handler) enableNodeMaintenance(w http.ResponseWriter, r *http.Request) error {
	return h.setNodeMaintenance(w, r, true)
}

func (h *handler) disableNodeMaintenance(w http.ResponseWriter, r *http.Request) error {
	return h.setNodeMaintenance(w, r, false)
}

func (h *handler) setNodeSchedulable(w http.ResponseWriter, r *http.Request, schedulable bool) error {
	clusterID := requestedClusterID(r)
	name := chi.URLParam(r, "name")
	item, err := h.nodesService.SetSchedulable(r.Context(), clusterID, name, schedulable)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       map[bool]string{true: "node.uncordon", false: "node.cordon"}[schedulable],
			ResourceType: "node",
			ResourceName: name,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrNodeNotFound):
			return newHTTPError(http.StatusNotFound, service.NodeNotFoundMessage(name))
		case errors.Is(err, service.ErrNodeLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       map[bool]string{true: "node.uncordon", false: "node.cordon"}[schedulable],
		ResourceType: "node",
		ResourceName: name,
		ClusterID:    clusterID,
		Status:       store.AuditStatusSuccess,
		Message:      map[bool]string{true: "Scheduling restored", false: "Scheduling disabled"}[schedulable],
	})
	writeJSON(w, http.StatusOK, item)
	return nil
}

func (h *handler) setNodeMaintenance(w http.ResponseWriter, r *http.Request, enabled bool) error {
	clusterID := requestedClusterID(r)
	name := chi.URLParam(r, "name")
	item, err := h.nodesService.SetMaintenanceTaint(r.Context(), clusterID, name, enabled)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       map[bool]string{true: "node.maintenance.enable", false: "node.maintenance.disable"}[enabled],
			ResourceType: "node",
			ResourceName: name,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrNodeNotFound):
			return newHTTPError(http.StatusNotFound, service.NodeNotFoundMessage(name))
		case errors.Is(err, service.ErrNodeLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "current cluster is not connected to a live Kubernetes cluster")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       map[bool]string{true: "node.maintenance.enable", false: "node.maintenance.disable"}[enabled],
		ResourceType: "node",
		ResourceName: name,
		ClusterID:    clusterID,
		Status:       store.AuditStatusSuccess,
		Message:      map[bool]string{true: "Maintenance taint enabled", false: "Maintenance taint cleared"}[enabled],
	})
	writeJSON(w, http.StatusOK, item)
	return nil
}

func (h *handler) podLogs(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	payload, err := h.podsService.LogsPayload(r.Context(), clusterID, namespace, name)
	if err != nil {
		if errors.Is(err, service.ErrPodNotFound) {
			return newHTTPError(http.StatusNotFound, service.PodNotFoundMessage(namespace, name))
		}
		return err
	}

	writeRawJSON(w, http.StatusOK, payload)
	return nil
}

func (h *handler) podMetrics(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("pods:metrics:%s:%s", namespace, name), readonlyMetricsTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.podsService.MetricsPayload(ctx, clusterID, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrPodNotFound) {
				return nil, newHTTPError(http.StatusNotFound, fmt.Sprintf("Pod metrics not found for %s/%s", namespace, name))
			}
			return nil, err
		}

		return payload, nil
	})
}

func (h *handler) podDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("pods:detail:%s:%s", namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		listPayload, err := h.podsService.ListPayload(ctx, clusterID)
		if err != nil {
			return nil, err
		}
		payload, err := service.FindPodPayload(listPayload, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrPodNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.PodNotFoundMessage(namespace, name))
			}
			return nil, err
		}
		if payload == nil {
			return nil, newHTTPError(http.StatusNotFound, service.PodNotFoundMessage(namespace, name))
		}

		return payload, nil
	})
}

func (h *handler) deletePod(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if err := h.podsService.Delete(r.Context(), clusterID, namespace, name); err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "pod.delete",
			ResourceType: "pod",
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrPodNotFound):
			return newHTTPError(http.StatusNotFound, service.PodNotFoundMessage(namespace, name))
		case errors.Is(err, service.ErrPodLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "pod.delete",
		ResourceType: "pod",
		ResourceName: name,
		Namespace:    namespace,
		ClusterID:    clusterID,
		Status:       store.AuditStatusSuccess,
		Message:      "Pod deleted",
	})
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Pod deleted",
	})
	return nil
}

func (h *handler) restartPod(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if err := h.podsService.Restart(r.Context(), clusterID, namespace, name); err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "pod.restart",
			ResourceType: "pod",
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrPodNotFound):
			return newHTTPError(http.StatusNotFound, service.PodNotFoundMessage(namespace, name))
		case errors.Is(err, service.ErrPodRestartUnsupported):
			return newHTTPError(http.StatusBadRequest, "pod restart requires a controller-managed pod")
		case errors.Is(err, service.ErrPodLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "current cluster is not connected to a live Kubernetes cluster")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "pod.restart",
		ResourceType: "pod",
		ResourceName: name,
		Namespace:    namespace,
		ClusterID:    clusterID,
		Status:       store.AuditStatusSuccess,
		Message:      "Pod restart triggered",
	})
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Pod restart triggered",
	})
	return nil
}

func (h *handler) namespaceDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("namespaces:detail:%s", name), readonlyNamespaceTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.namespacesService.DetailPayload(ctx, clusterID, name)
		if err != nil {
			if errors.Is(err, service.ErrNamespaceNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.NamespaceNotFoundMessage(name))
			}
			return nil, err
		}
		if payload == nil {
			return nil, newHTTPError(http.StatusNotFound, service.NamespaceNotFoundMessage(name))
		}

		return payload, nil
	})
}

// ── Services ──

func (h *handler) listServices(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "services:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.servicesService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) serviceDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("services:detail:%s:%s", namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.servicesService.DetailPayload(ctx, clusterID, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrServiceNotFound) || errors.Is(err, service.ErrWorkloadNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.ServiceNotFoundMessage(namespace, name))
			}
			return nil, err
		}
		return payload, nil
	})
}

func (h *handler) deleteService(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	err := h.servicesService.Delete(r.Context(), clusterID, namespace, name)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action: "service.delete", ResourceType: "service", ResourceName: name,
			Namespace: namespace, ClusterID: clusterID, Status: store.AuditStatusFailed,
			Message: errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrServiceNotFound):
			return newHTTPError(http.StatusNotFound, service.ServiceNotFoundMessage(namespace, name))
		case errors.Is(err, service.ErrServiceLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action: "service.delete", ResourceType: "service", ResourceName: name,
		Namespace: namespace, ClusterID: clusterID, Status: store.AuditStatusSuccess,
		Message: fmt.Sprintf("删除 Service %s/%s", namespace, name),
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
	return nil
}

// ── Ingresses ──

func (h *handler) listIngresses(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "ingresses:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.ingressesService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) ingressDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("ingresses:detail:%s:%s", namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.ingressesService.DetailPayload(ctx, clusterID, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrIngressNotFound) || errors.Is(err, service.ErrWorkloadNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.IngressNotFoundMessage(namespace, name))
			}
			return nil, err
		}
		return payload, nil
	})
}

func (h *handler) deleteIngress(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	err := h.ingressesService.Delete(r.Context(), clusterID, namespace, name)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action: "ingress.delete", ResourceType: "ingress", ResourceName: name,
			Namespace: namespace, ClusterID: clusterID, Status: store.AuditStatusFailed,
			Message: errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrIngressNotFound):
			return newHTTPError(http.StatusNotFound, service.IngressNotFoundMessage(namespace, name))
		case errors.Is(err, service.ErrIngressLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action: "ingress.delete", ResourceType: "ingress", ResourceName: name,
		Namespace: namespace, ClusterID: clusterID, Status: store.AuditStatusSuccess,
		Message: fmt.Sprintf("删除 Ingress %s/%s", namespace, name),
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
	return nil
}

// ── ConfigMaps ──

func (h *handler) listConfigMaps(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "configmaps:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.configMapsService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) configMapDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("configmaps:detail:%s:%s", namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.configMapsService.DetailPayload(ctx, clusterID, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrConfigMapNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.ConfigMapNotFoundMessage(namespace, name))
			}
			return nil, err
		}
		return payload, nil
	})
}

func (h *handler) deleteConfigMap(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	err := h.configMapsService.Delete(r.Context(), clusterID, namespace, name)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action: "configmap.delete", ResourceType: "configmap", ResourceName: name,
			Namespace: namespace, ClusterID: clusterID, Status: store.AuditStatusFailed,
			Message: errorMessageForAudit(err),
		})
		switch {
		case errors.Is(err, service.ErrConfigMapNotFound):
			return newHTTPError(http.StatusNotFound, service.ConfigMapNotFoundMessage(namespace, name))
		case errors.Is(err, service.ErrConfigMapLiveClusterNeeded):
			return newHTTPError(http.StatusBadRequest, "当前集群未连接真实 Kubernetes，暂不支持写操作")
		default:
			return err
		}
	}

	h.invalidateReadonlyCache(r.Context(), clusterID)
	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action: "configmap.delete", ResourceType: "configmap", ResourceName: name,
		Namespace: namespace, ClusterID: clusterID, Status: store.AuditStatusSuccess,
		Message: fmt.Sprintf("删除 ConfigMap %s/%s", namespace, name),
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
	return nil
}

// ── Secrets ──

func (h *handler) listSecrets(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "secrets:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.secretsService.ListPayload(ctx, clusterID)
	})
}

func (h *handler) secretDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("secrets:detail:%s:%s", namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.secretsService.DetailPayload(ctx, clusterID, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrSecretNotFound) {
				return nil, newHTTPError(http.StatusNotFound, service.SecretNotFoundMessage(namespace, name))
			}
			return nil, err
		}
		return payload, nil
	})
}

// ── PVCs ──

func (h *handler) listPVCs(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "pvcs:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.storageService.ListPVCPayload(ctx, clusterID)
	})
}

func (h *handler) pvcDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("pvcs:detail:%s:%s", namespace, name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.storageService.PVCDetailPayload(ctx, clusterID, namespace, name)
		if err != nil {
			if errors.Is(err, service.ErrPVCNotFound) {
				return nil, newHTTPError(http.StatusNotFound, "PVC not found")
			}
			return nil, err
		}
		return payload, nil
	})
}

// ── PVs ──

func (h *handler) listPVs(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "pvs:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.storageService.ListPVPayload(ctx, clusterID)
	})
}

func (h *handler) pvDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("pvs:detail:%s", name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.storageService.PVDetailPayload(ctx, clusterID, name)
		if err != nil {
			if errors.Is(err, service.ErrPVNotFound) {
				return nil, newHTTPError(http.StatusNotFound, "PV not found")
			}
			return nil, err
		}
		return payload, nil
	})
}

// ── StorageClasses ──

func (h *handler) listStorageClasses(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	return h.respondWithCachedPayload(w, r, "storageclasses:list", readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.storageService.ListStorageClassPayload(ctx, clusterID)
	})
}

func (h *handler) storageClassDetail(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	name := chi.URLParam(r, "name")
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("storageclasses:detail:%s", name), readonlyDefaultTTL, func(ctx context.Context) (json.RawMessage, error) {
		payload, err := h.storageService.StorageClassDetailPayload(ctx, clusterID, name)
		if err != nil {
			if errors.Is(err, service.ErrStorageClassNotFound) {
				return nil, newHTTPError(http.StatusNotFound, "StorageClass not found")
			}
			return nil, err
		}
		return payload, nil
	})
}

// ── Events ──

func (h *handler) listEvents(w http.ResponseWriter, r *http.Request) error {
	clusterID := requestedClusterID(r)
	filter := service.EventFilter{
		Namespace:          r.URL.Query().Get("namespace"),
		Type:               r.URL.Query().Get("type"),
		InvolvedObjectKind: r.URL.Query().Get("kind"),
	}
	return h.respondWithCachedPayload(w, r, fmt.Sprintf("events:list:%s:%s:%s", filter.Namespace, filter.Type, filter.InvolvedObjectKind), readonlyEventsTTL, func(ctx context.Context) (json.RawMessage, error) {
		return h.eventsService.ListPayload(ctx, clusterID, filter)
	})
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

func requestedLimit(r *http.Request, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get("limit"))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func requestedPage(r *http.Request, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get("page"))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func (h *handler) recordAudit(ctx context.Context, r *http.Request, input store.AuditLogInput) {
	if h.auditStore == nil {
		return
	}

	if input.ActorName == "" {
		input.ActorName = "管理员"
	}
	if input.ActorEmail == "" {
		input.ActorEmail = "admin@k8s-agent.com"
	}

	if input.ClusterID != "" && input.ClusterName == "" && h.clusterStore != nil {
		cluster, err := h.clusterStore.GetByID(ctx, input.ClusterID)
		if err == nil && cluster != nil {
			input.ClusterName = cluster.Name
		}
	}

	if err := h.auditStore.Record(ctx, input); err != nil {
		log.Printf("audit log write failed %s %s: %v", r.Method, r.URL.Path, err)
	}
}

func errorMessageForAudit(err error) string {
	if err == nil {
		return ""
	}

	var requestErr *httpError
	if errors.As(err, &requestErr) {
		return requestErr.message
	}

	if status, message, ok := translateUpstreamError(err); ok {
		_ = status
		return message
	}

	return err.Error()
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

func requestedClusterID(r *http.Request) string {
	return strings.TrimSpace(r.URL.Query().Get("clusterId"))
}

func requestedDashboardRange(r *http.Request) string {
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get("range"))) {
	case "week":
		return "week"
	case "month":
		return "month"
	default:
		return "today"
	}
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

type notificationSettingsDocument struct {
	Level        string   `json:"level"`
	EnabledTypes []string `json:"enabledTypes"`
}

type notificationStateDocument struct {
	LastReadAt string `json:"lastReadAt"`
}

type notificationItemResponse struct {
	ID           string    `json:"id"`
	Kind         string    `json:"kind"`
	Level        string    `json:"level"`
	Title        string    `json:"title"`
	Message      string    `json:"message"`
	Action       string    `json:"action"`
	ResourceType string    `json:"resourceType"`
	ResourceName string    `json:"resourceName"`
	ClusterID    string    `json:"clusterId,omitempty"`
	ClusterName  string    `json:"clusterName,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	Read         bool      `json:"read"`
}

type notificationListResponse struct {
	Items       []notificationItemResponse `json:"items"`
	UnreadCount int                        `json:"unreadCount"`
	Total       int                        `json:"total"`
	LastReadAt  string                     `json:"lastReadAt,omitempty"`
}

type systemSettingsDocument struct {
	Theme                     string                       `json:"theme"`
	Language                  string                       `json:"language"`
	AutoRefreshInterval       int                          `json:"autoRefreshInterval"`
	ShowResourceUsage         bool                         `json:"showResourceUsage"`
	ShowEvents                bool                         `json:"showEvents"`
	ShowNamespaceDistribution bool                         `json:"showNamespaceDistribution"`
	NavigationPosition        string                       `json:"navigationPosition"`
	Notifications             notificationSettingsDocument `json:"notifications"`
}

type systemSettingsPayload struct {
	Theme                     *string                      `json:"theme"`
	Language                  *string                      `json:"language"`
	AutoRefreshInterval       *int                         `json:"autoRefreshInterval"`
	ShowResourceUsage         *bool                        `json:"showResourceUsage"`
	ShowEvents                *bool                        `json:"showEvents"`
	ShowNamespaceDistribution *bool                        `json:"showNamespaceDistribution"`
	NavigationPosition        *string                      `json:"navigationPosition"`
	Notifications             *notificationSettingsPayload `json:"notifications"`
}

type notificationSettingsPayload struct {
	Level        string   `json:"level"`
	EnabledTypes []string `json:"enabledTypes"`
}

type aiModelPayload struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	APIBaseURL string `json:"apiBaseUrl"`
	APIKey     string `json:"apiKey"`
	ModelType  string `json:"modelType"`
	IsDefault  bool   `json:"isDefault"`
	HasAPIKey  bool   `json:"hasApiKey,omitempty"`
}

type workloadScalePayload struct {
	Replicas *int32 `json:"replicas"`
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
	connectionChanged := existing == nil
	if existing != nil {
		cluster = *existing
	}

	if payload.Name != nil {
		cluster.Name = strings.TrimSpace(*payload.Name)
	}
	if payload.Mode != nil {
		value := strings.TrimSpace(*payload.Mode)
		if value != cluster.Mode {
			connectionChanged = true
		}
		cluster.Mode = value
	}
	if payload.APIServer != nil {
		value := strings.TrimSpace(*payload.APIServer)
		if value != cluster.APIServer {
			connectionChanged = true
		}
		cluster.APIServer = value
	}
	if payload.KubeconfigPath != nil {
		value := strings.TrimSpace(*payload.KubeconfigPath)
		if value != cluster.KubeconfigPath {
			connectionChanged = true
		}
		cluster.KubeconfigPath = value
	}
	if payload.Kubeconfig != nil {
		value := strings.TrimSpace(*payload.Kubeconfig)
		if value != cluster.Kubeconfig {
			connectionChanged = true
		}
		cluster.Kubeconfig = value
	}
	if payload.Token != nil {
		value := strings.TrimSpace(*payload.Token)
		if value != cluster.Token {
			connectionChanged = true
		}
		cluster.Token = value
	}
	if payload.CAData != nil {
		value := strings.TrimSpace(*payload.CAData)
		if value != cluster.CAData {
			connectionChanged = true
		}
		cluster.CAData = value
	}
	if payload.InsecureSkipTLSVerify != nil {
		if *payload.InsecureSkipTLSVerify != cluster.InsecureSkipTLSVerify {
			connectionChanged = true
		}
		cluster.InsecureSkipTLSVerify = *payload.InsecureSkipTLSVerify
	}
	if payload.IsDefault != nil {
		cluster.IsDefault = *payload.IsDefault
	}
	if payload.IsEnabled != nil {
		cluster.IsEnabled = *payload.IsEnabled
	}

	if connectionChanged {
		cluster.LastConnectionStatus = store.ConnectionStatusUnknown
		cluster.LastConnectionError = ""
		cluster.LastConnectedAt = nil
	}

	if cluster.Name == "" {
		return store.Cluster{}, fmt.Errorf("name is required")
	}
	if cluster.Mode == "" {
		return store.Cluster{}, fmt.Errorf("mode is required")
	}

	return cluster, nil
}

func defaultSystemSettings() systemSettingsDocument {
	return systemSettingsDocument{
		Theme:                     "system",
		Language:                  "zh-CN",
		AutoRefreshInterval:       30,
		ShowResourceUsage:         true,
		ShowEvents:                true,
		ShowNamespaceDistribution: true,
		NavigationPosition:        "left",
		Notifications: notificationSettingsDocument{
			Level:        "all",
			EnabledTypes: []string{"node", "pod", "workload", "issue"},
		},
	}
}

func defaultAIModels() []aiModelPayload {
	return []aiModelPayload{
		{
			ID:         "grok-4.1-fast",
			Name:       "Grok 4.1 Fast",
			APIBaseURL: "http://66.154.105.107:8000/v1",
			APIKey:     "",
			ModelType:  "openai",
			IsDefault:  true,
		},
	}
}

func mergeSystemSettings(base systemSettingsDocument, payload systemSettingsPayload) systemSettingsDocument {
	if payload.Theme != nil {
		base.Theme = *payload.Theme
	}
	if payload.Language != nil {
		base.Language = *payload.Language
	}
	if payload.AutoRefreshInterval != nil {
		base.AutoRefreshInterval = *payload.AutoRefreshInterval
	}
	if payload.ShowResourceUsage != nil {
		base.ShowResourceUsage = *payload.ShowResourceUsage
	}
	if payload.ShowEvents != nil {
		base.ShowEvents = *payload.ShowEvents
	}
	if payload.ShowNamespaceDistribution != nil {
		base.ShowNamespaceDistribution = *payload.ShowNamespaceDistribution
	}
	if payload.NavigationPosition != nil {
		base.NavigationPosition = *payload.NavigationPosition
	}
	if payload.Notifications != nil {
		base.Notifications = mergeNotificationSettings(base.Notifications, *payload.Notifications)
	}
	return base
}

func mergeNotificationSettings(base notificationSettingsDocument, payload notificationSettingsPayload) notificationSettingsDocument {
	base.Level = payload.Level
	base.EnabledTypes = payload.EnabledTypes
	return base
}

func normalizeSystemSettings(input systemSettingsDocument) (systemSettingsDocument, error) {
	settings := defaultSystemSettings()
	if trimmed := strings.TrimSpace(input.Theme); trimmed != "" {
		settings.Theme = trimmed
	}
	if trimmed := strings.TrimSpace(input.Language); trimmed != "" {
		settings.Language = trimmed
	}
	settings.AutoRefreshInterval = input.AutoRefreshInterval
	settings.ShowResourceUsage = input.ShowResourceUsage
	settings.ShowEvents = input.ShowEvents
	settings.ShowNamespaceDistribution = input.ShowNamespaceDistribution
	if trimmed := strings.TrimSpace(input.NavigationPosition); trimmed != "" {
		settings.NavigationPosition = trimmed
	}
	notifications, err := normalizeNotificationSettings(input.Notifications)
	if err != nil {
		return systemSettingsDocument{}, err
	}
	settings.Notifications = notifications

	switch settings.Theme {
	case "light", "dark", "system":
	default:
		return systemSettingsDocument{}, fmt.Errorf("unsupported theme: %s", settings.Theme)
	}

	if settings.Language == "" {
		return systemSettingsDocument{}, fmt.Errorf("language is required")
	}
	if settings.AutoRefreshInterval < 0 {
		return systemSettingsDocument{}, fmt.Errorf("autoRefreshInterval must be greater than or equal to 0")
	}

	switch settings.NavigationPosition {
	case "left", "top":
	default:
		return systemSettingsDocument{}, fmt.Errorf("unsupported navigationPosition: %s", settings.NavigationPosition)
	}

	return settings, nil
}

func normalizeNotificationSettings(input notificationSettingsDocument) (notificationSettingsDocument, error) {
	settings := notificationSettingsDocument{
		Level:        strings.TrimSpace(input.Level),
		EnabledTypes: make([]string, 0, len(input.EnabledTypes)),
	}

	if settings.Level == "" {
		settings.Level = "all"
	}
	switch settings.Level {
	case "all", "critical", "none":
	default:
		return notificationSettingsDocument{}, fmt.Errorf("unsupported notification level: %s", settings.Level)
	}

	seen := map[string]struct{}{}
	for _, item := range input.EnabledTypes {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		switch value {
		case "node", "pod", "workload", "issue":
		default:
			return notificationSettingsDocument{}, fmt.Errorf("unsupported notification type: %s", value)
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		settings.EnabledTypes = append(settings.EnabledTypes, value)
	}

	if _, ok := seen["issue"]; !ok {
		settings.EnabledTypes = append(settings.EnabledTypes, "issue")
	}

	if len(settings.EnabledTypes) == 0 {
		settings.EnabledTypes = []string{"node", "pod", "workload", "issue"}
	}

	return settings, nil
}

func normalizeAIModels(input []aiModelPayload) ([]aiModelPayload, error) {
	if len(input) == 0 {
		return nil, fmt.Errorf("at least one AI model is required")
	}

	models := make([]aiModelPayload, 0, len(input))
	seenIDs := map[string]struct{}{}
	defaultAssigned := false

	for _, item := range input {
		model := aiModelPayload{
			ID:         strings.TrimSpace(item.ID),
			Name:       strings.TrimSpace(item.Name),
			APIBaseURL: strings.TrimSpace(item.APIBaseURL),
			APIKey:     strings.TrimSpace(item.APIKey),
			ModelType:  strings.TrimSpace(item.ModelType),
			IsDefault:  item.IsDefault,
			HasAPIKey:  strings.TrimSpace(item.APIKey) != "",
		}

		if model.ID == "" {
			return nil, fmt.Errorf("model id is required")
		}
		if model.Name == "" {
			return nil, fmt.Errorf("model name is required")
		}
		if model.APIBaseURL == "" {
			return nil, fmt.Errorf("model apiBaseUrl is required")
		}
		if model.ModelType == "" {
			model.ModelType = "other"
		}
		if _, ok := seenIDs[model.ID]; ok {
			return nil, fmt.Errorf("duplicate model id: %s", model.ID)
		}
		seenIDs[model.ID] = struct{}{}

		if model.IsDefault {
			if defaultAssigned {
				model.IsDefault = false
			} else {
				defaultAssigned = true
			}
		}

		models = append(models, model)
	}

	if !defaultAssigned {
		models[0].IsDefault = true
	}

	return models, nil
}

func redactAIModels(input []aiModelPayload) []aiModelPayload {
	models := make([]aiModelPayload, 0, len(input))
	for _, item := range input {
		models = append(models, aiModelPayload{
			ID:         item.ID,
			Name:       item.Name,
			APIBaseURL: item.APIBaseURL,
			APIKey:     "",
			ModelType:  item.ModelType,
			IsDefault:  item.IsDefault,
			HasAPIKey:  strings.TrimSpace(item.APIKey) != "",
		})
	}
	return models
}

func mergeAIModelSecrets(input []aiModelPayload, existing []aiModelPayload) []aiModelPayload {
	if len(input) == 0 {
		return input
	}

	existingByID := make(map[string]aiModelPayload, len(existing))
	for _, item := range existing {
		existingByID[item.ID] = item
	}

	merged := make([]aiModelPayload, 0, len(input))
	for _, item := range input {
		if strings.TrimSpace(item.APIKey) == "" {
			if current, ok := existingByID[strings.TrimSpace(item.ID)]; ok {
				item.APIKey = current.APIKey
			}
		}
		item.HasAPIKey = strings.TrimSpace(item.APIKey) != ""
		merged = append(merged, item)
	}
	return merged
}

func (h *handler) currentSystemSettings(ctx context.Context) (systemSettingsDocument, error) {
	raw, err := h.readSettingsPayload(ctx, store.SettingsKeySystem)
	if err != nil {
		return systemSettingsDocument{}, err
	}
	if len(raw) == 0 {
		return defaultSystemSettings(), nil
	}

	var settings systemSettingsDocument
	if err := json.Unmarshal(raw, &settings); err != nil {
		return systemSettingsDocument{}, err
	}

	return normalizeSystemSettings(settings)
}

func (h *handler) saveSystemSettings(ctx context.Context, settings systemSettingsDocument) error {
	if h.settingsStore != nil {
		return h.settingsStore.Put(ctx, store.SettingsKeySystem, settings)
	}
	return nil
}

func (h *handler) currentAIModels(ctx context.Context) ([]aiModelPayload, error) {
	raw, err := h.readSettingsPayload(ctx, store.SettingsKeyAIModels)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return defaultAIModels(), nil
	}

	var models []aiModelPayload
	if err := json.Unmarshal(raw, &models); err != nil {
		return nil, err
	}

	return normalizeAIModels(models)
}

func (h *handler) saveAIModels(ctx context.Context, models []aiModelPayload) error {
	if h.settingsStore != nil {
		return h.settingsStore.Put(ctx, store.SettingsKeyAIModels, models)
	}
	return nil
}

func (h *handler) currentNotificationState(ctx context.Context) (notificationStateDocument, error) {
	raw, err := h.readSettingsPayload(ctx, store.SettingsKeyNotificationsState)
	if err != nil {
		return notificationStateDocument{}, err
	}
	if len(raw) == 0 {
		return notificationStateDocument{}, nil
	}

	var state notificationStateDocument
	if err := json.Unmarshal(raw, &state); err != nil {
		return notificationStateDocument{}, err
	}

	return state, nil
}

func (h *handler) saveNotificationState(ctx context.Context, state notificationStateDocument) error {
	if h.settingsStore != nil {
		return h.settingsStore.Put(ctx, store.SettingsKeyNotificationsState, state)
	}
	return nil
}

func (h *handler) readSettingsPayload(ctx context.Context, key string) (json.RawMessage, error) {
	if h.settingsStore != nil {
		payload, err := h.settingsStore.Get(ctx, key)
		if err != nil {
			return nil, err
		}
		if payload != nil {
			return payload, nil
		}
	}

	return h.store.Get(ctx, "settings", key)
}

func buildNotifications(entries []store.AuditLogEntry, issues []store.AIIssue, settings notificationSettingsDocument, lastReadAt string, limit int) ([]notificationItemResponse, int, int) {
	if limit <= 0 {
		limit = 12
	}

	var lastRead time.Time
	if trimmed := strings.TrimSpace(lastReadAt); trimmed != "" {
		parsed, err := time.Parse(time.RFC3339Nano, trimmed)
		if err == nil {
			lastRead = parsed
		}
	}

	enabledKinds := map[string]struct{}{}
	for _, item := range settings.EnabledTypes {
		enabledKinds[strings.TrimSpace(item)] = struct{}{}
	}

	notifications := make([]notificationItemResponse, 0, limit)
	for _, entry := range entries {
		kind, ok := notificationKindForAudit(entry)
		if !ok {
			continue
		}
		if len(enabledKinds) > 0 {
			if _, exists := enabledKinds[kind]; !exists {
				continue
			}
		}

		level := notificationLevelForAudit(entry)
		if settings.Level == "critical" && level != "critical" {
			continue
		}

		item := notificationItemResponse{
			ID:           entry.ID,
			Kind:         kind,
			Level:        level,
			Title:        notificationTitleForAudit(entry),
			Message:      strings.TrimSpace(entry.Message),
			Action:       entry.Action,
			ResourceType: entry.ResourceType,
			ResourceName: entry.ResourceName,
			ClusterID:    entry.ClusterID,
			ClusterName:  entry.ClusterName,
			CreatedAt:    entry.CreatedAt,
			Read:         !lastRead.IsZero() && !entry.CreatedAt.After(lastRead),
		}
		notifications = append(notifications, item)
	}

	notifications = append(notifications, buildIssueNotifications(issues, settings, lastRead)...)
	sort.Slice(notifications, func(i, j int) bool {
		return notifications[i].CreatedAt.After(notifications[j].CreatedAt)
	})

	total := len(notifications)
	unreadCount := 0
	for _, item := range notifications {
		if !item.Read {
			unreadCount++
		}
	}
	if len(notifications) > limit {
		notifications = notifications[:limit]
	}

	return notifications, unreadCount, total
}

func buildIssueNotifications(issues []store.AIIssue, settings notificationSettingsDocument, lastRead time.Time) []notificationItemResponse {
	enabledKinds := map[string]struct{}{}
	for _, item := range settings.EnabledTypes {
		enabledKinds[strings.TrimSpace(item)] = struct{}{}
	}
	if len(enabledKinds) > 0 {
		if _, exists := enabledKinds["issue"]; !exists {
			return []notificationItemResponse{}
		}
	}

	items := make([]notificationItemResponse, 0, len(issues))
	for _, issue := range issues {
		if issue.Status == "resolved" || issue.Status == "recovered" || issue.Status == "silenced" {
			continue
		}
		if issue.RiskLevel != "critical" && issue.RiskLevel != "high" && issue.Status != "escalated" {
			continue
		}

		level := "info"
		if issue.RiskLevel == "critical" || issue.Status == "escalated" {
			level = "critical"
		}
		if settings.Level == "critical" && level != "critical" {
			continue
		}

		createdAt := issue.UpdatedAt
		if issue.EscalatedAt != nil {
			createdAt = *issue.EscalatedAt
		}
		items = append(items, notificationItemResponse{
			ID:           "issue-" + issue.ID + "-" + issue.Status,
			Kind:         "issue",
			Level:        level,
			Title:        notificationTitleForIssue(issue),
			Message:      strings.TrimSpace(issue.Summary),
			Action:       "ai.issue.alert",
			ResourceType: "ai-issue",
			ResourceName: issue.Title,
			ClusterID:    issue.ClusterID,
			ClusterName:  issue.ClusterName,
			CreatedAt:    createdAt,
			Read:         !lastRead.IsZero() && !createdAt.After(lastRead),
		})
	}
	return items
}

func notificationKindForAudit(entry store.AuditLogEntry) (string, bool) {
	switch strings.TrimSpace(entry.ResourceType) {
	case "node":
		return "node", true
	case "pod":
		return "pod", true
	case "deployments", "statefulsets", "daemonsets", "cronjobs":
		return "workload", true
	case "ai-inspection":
		return "issue", true
	default:
		return "", false
	}
}

func notificationLevelForAudit(entry store.AuditLogEntry) string {
	if entry.Status == store.AuditStatusFailed {
		return "critical"
	}
	return "info"
}

func notificationTitleForAudit(entry store.AuditLogEntry) string {
	switch entry.Action {
	case "ai.followup.recheck":
		if entry.Status == store.AuditStatusFailed {
			return "AI 自动复检仍有风险"
		}
		return "AI 自动复检已恢复"
	case "node.cordon":
		return "节点已设为不可调度"
	case "node.uncordon":
		return "节点已恢复调度"
	case "node.maintenance.enable":
		return "节点维护模式已开启"
	case "node.maintenance.disable":
		return "节点维护模式已关闭"
	case "pod.restart":
		return "Pod 已重启"
	case "pod.delete":
		return "Pod 已删除"
	case "workload.scale":
		return "工作负载副本已更新"
	case "workload.restart":
		return "工作负载已重启"
	case "workload.delete":
		return "工作负载已删除"
	case "workload.pause":
		return "工作负载已暂停"
	case "workload.resume":
		return "工作负载已恢复"
	default:
		if entry.Status == store.AuditStatusFailed {
			return "集群操作失败"
		}
		return "集群操作通知"
	}
}

func notificationTitleForIssue(issue store.AIIssue) string {
	switch issue.Status {
	case "escalated":
		return "AI 问题已升级"
	case "following":
		return "AI 问题持续跟踪中"
	default:
		if issue.RiskLevel == "critical" {
			return "AI 发现高危问题"
		}
		return "AI 发现高风险问题"
	}
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
