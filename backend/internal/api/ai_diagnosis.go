package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"k8s-agent-backend/internal/service"
	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
)

type aiDiagnosisChatRequest struct {
	ConversationID string `json:"conversationId"`
	Message        string `json:"message"`
	ClusterID      string `json:"clusterId"`
}

type aiDiagnosisConversationResponse struct {
	ID          string                        `json:"id"`
	Title       string                        `json:"title"`
	Summary     string                        `json:"summary"`
	ClusterID   string                        `json:"clusterId,omitempty"`
	ClusterName string                        `json:"clusterName,omitempty"`
	ModelID     string                        `json:"modelId,omitempty"`
	ModelName   string                        `json:"modelName,omitempty"`
	CreatedAt   time.Time                     `json:"createdAt"`
	UpdatedAt   time.Time                     `json:"updatedAt"`
	Messages    []aiDiagnosisMessageResponse  `json:"messages,omitempty"`
}

type aiDiagnosisMessageResponse struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type aiDiagnosisChatResponse struct {
	Conversation aiDiagnosisConversationResponse `json:"conversation"`
	Cluster      aiDiagnosisClusterStatus        `json:"cluster"`
}

type aiDiagnosisClusterStatus struct {
	ClusterID       string                    `json:"clusterId,omitempty"`
	ClusterName     string                    `json:"clusterName"`
	ConnectionState string                    `json:"connectionState"`
	Source          string                    `json:"source"`
	Overview        service.DashboardOverview `json:"overview"`
	NodeHighlights  []aiDiagnosisNodeSummary  `json:"nodeHighlights"`
	ProblemPods     []aiDiagnosisPodSummary   `json:"problemPods"`
	WorkloadAlerts  []aiDiagnosisWorkloadHint `json:"workloadAlerts"`
	RecentEvents    []service.DashboardEvent  `json:"recentEvents"`
	GeneratedAt     time.Time                 `json:"generatedAt"`
}

type aiDiagnosisNodeSummary struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	Schedulable bool   `json:"schedulable"`
	CPUUsage    int    `json:"cpuUsage"`
	MemoryUsage int    `json:"memoryUsage"`
	Pods        int    `json:"pods"`
	IP          string `json:"ip"`
}

type aiDiagnosisPodSummary struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Node      string `json:"node"`
}

type aiDiagnosisWorkloadHint struct {
	Scope     string `json:"scope"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Ready     int32  `json:"ready"`
	Desired   int32  `json:"desired"`
	Available int32  `json:"available"`
	Paused    bool   `json:"paused"`
}

func (h *handler) listAIDiagnosisHistory(w http.ResponseWriter, r *http.Request) error {
	if h.aiHistoryStore == nil {
		writeJSON(w, http.StatusOK, []aiDiagnosisConversationResponse{})
		return nil
	}

	items, err := h.aiHistoryStore.List(r.Context(), requestedClusterID(r), 30)
	if err != nil {
		return err
	}

	response := make([]aiDiagnosisConversationResponse, 0, len(items))
	for _, item := range items {
		response = append(response, toAIDiagnosisConversationResponse(item))
	}

	writeJSON(w, http.StatusOK, response)
	return nil
}

func (h *handler) getAIDiagnosisConversation(w http.ResponseWriter, r *http.Request) error {
	if h.aiHistoryStore == nil {
		return newHTTPError(http.StatusNotFound, "会话不存在")
	}

	conversation, err := h.aiHistoryStore.Get(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, store.ErrAIConversationNotFound) {
		return newHTTPError(http.StatusNotFound, "会话不存在")
	}
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, toAIDiagnosisConversationResponse(*conversation))
	return nil
}

func (h *handler) deleteAIDiagnosisConversation(w http.ResponseWriter, r *http.Request) error {
	if h.aiHistoryStore == nil {
		return newHTTPError(http.StatusNotFound, "会话不存在")
	}

	if err := h.aiHistoryStore.Delete(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, store.ErrAIConversationNotFound) {
			return newHTTPError(http.StatusNotFound, "会话不存在")
		}
		return err
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "会话已删除"})
	return nil
}

func (h *handler) aiDiagnosisNodeStatus(w http.ResponseWriter, r *http.Request) error {
	status, err := h.buildAIDiagnosisClusterStatus(r.Context(), requestedClusterID(r))
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, status)
	return nil
}

func (h *handler) aiDiagnosisChat(w http.ResponseWriter, r *http.Request) error {
	var payload aiDiagnosisChatRequest
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	payload.Message = strings.TrimSpace(payload.Message)
	if payload.Message == "" {
		return newHTTPError(http.StatusBadRequest, "message is required")
	}

	model, err := h.defaultAIDiagnosisModel(r.Context())
	if err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	clusterID := strings.TrimSpace(payload.ClusterID)
	conversationID := strings.TrimSpace(payload.ConversationID)
	var existingConversation *store.AIConversation
	if conversationID != "" && h.aiHistoryStore != nil {
		existingConversation, err = h.aiHistoryStore.Get(r.Context(), conversationID)
		if errors.Is(err, store.ErrAIConversationNotFound) {
			return newHTTPError(http.StatusNotFound, "会话不存在")
		}
		if err != nil {
			return err
		}

		if clusterID == "" {
			clusterID = existingConversation.ClusterID
		} else if existingConversation.ClusterID != "" && existingConversation.ClusterID != clusterID {
			return newHTTPError(http.StatusBadRequest, "所选会话与当前分析集群不一致，请新建会话后重试")
		}
	}

	clusterStatus, err := h.buildAIDiagnosisClusterStatus(r.Context(), clusterID)
	if err != nil {
		return err
	}

	messages := []llmChatMessage{
		{
			Role: "system",
			Content: strings.TrimSpace(`你是 K8s Agent 的 Kubernetes 智能诊断助手。
请始终使用中文回答，语气专业、直接、可执行。
你只能依据提供的集群上下文和用户问题作答；如果上下文不足，要明确说明缺失信息，不要编造不存在的 Pod、节点、日志或指标。
如果用户请求执行集群操作，你只能给出建议步骤和风险提示，不能声称已经替用户执行。
回答尽量结构化，优先给出结论、风险点和下一步建议。`),
		},
	}

	clusterContextJSON, err := json.MarshalIndent(clusterStatus, "", "  ")
	if err != nil {
		return err
	}
	messages = append(messages, llmChatMessage{
		Role:    "system",
		Content: "当前诊断上下文如下，请结合这些信息回答：\n" + string(clusterContextJSON),
	})

	if existingConversation != nil {
		for _, message := range existingConversation.Messages {
			role := strings.TrimSpace(message.Role)
			if role != "user" && role != "assistant" {
				continue
			}
			content := strings.TrimSpace(message.Content)
			if content == "" {
				continue
			}
			messages = append(messages, llmChatMessage{
				Role:    role,
				Content: content,
			})
		}
	}

	messages = append(messages, llmChatMessage{
		Role:    "user",
		Content: payload.Message,
	})

	chatCtx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()

	answer, err := h.llmClient.chatCompletion(chatCtx, model, messages)
	if err != nil {
		return newHTTPError(http.StatusBadGateway, fmt.Sprintf("调用 AI 服务失败: %s", err.Error()))
	}

	if h.aiHistoryStore == nil {
		response := aiDiagnosisConversationResponse{
			ID:          "",
			Title:       truncateText(payload.Message, 36),
			Summary:     truncateText(answer, 120),
			ClusterID:   clusterStatus.ClusterID,
			ClusterName: clusterStatus.ClusterName,
			ModelID:     model.ID,
			ModelName:   model.Name,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
			Messages: []aiDiagnosisMessageResponse{
				{
					ID:        "local-user",
					Role:      "user",
					Content:   payload.Message,
					CreatedAt: time.Now(),
				},
				{
					ID:        "local-assistant",
					Role:      "assistant",
					Content:   answer,
					CreatedAt: time.Now(),
				},
			},
		}
		writeJSON(w, http.StatusOK, aiDiagnosisChatResponse{
			Conversation: response,
			Cluster:      clusterStatus,
		})
		return nil
	}

	savedConversation, err := h.aiHistoryStore.SaveExchange(r.Context(), store.SaveAIConversationInput{
		ConversationID:   conversationID,
		Title:            truncateText(payload.Message, 36),
		Summary:          truncateText(answer, 120),
		ClusterID:        clusterStatus.ClusterID,
		ClusterName:      clusterStatus.ClusterName,
		ModelID:          model.ID,
		ModelName:        model.Name,
		UserMessage:      payload.Message,
		AssistantMessage: answer,
	})
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, aiDiagnosisChatResponse{
		Conversation: toAIDiagnosisConversationResponse(*savedConversation),
		Cluster:      clusterStatus,
	})
	return nil
}

func (h *handler) defaultAIDiagnosisModel(ctx context.Context) (aiModelPayload, error) {
	models, err := h.currentAIModels(ctx)
	if err != nil {
		return aiModelPayload{}, err
	}
	if len(models) == 0 {
		return aiModelPayload{}, fmt.Errorf("请先在设置中配置 AI 模型")
	}

	selected := models[0]
	for _, model := range models {
		if model.IsDefault {
			selected = model
			break
		}
	}

	if strings.TrimSpace(selected.APIBaseURL) == "" {
		return aiModelPayload{}, fmt.Errorf("默认 AI 模型缺少 API 地址")
	}
	if strings.TrimSpace(selected.APIKey) == "" {
		return aiModelPayload{}, fmt.Errorf("默认 AI 模型缺少 API 密钥")
	}
	if strings.TrimSpace(selected.ID) == "" {
		return aiModelPayload{}, fmt.Errorf("默认 AI 模型缺少模型标识")
	}

	if strings.TrimSpace(selected.Name) == "" {
		selected.Name = selected.ID
	}

	return selected, nil
}

func (h *handler) buildAIDiagnosisClusterStatus(ctx context.Context, clusterID string) (aiDiagnosisClusterStatus, error) {
	overviewPayload, err := h.dashboardService.OverviewPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	nodesPayload, err := h.nodesService.ListPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	podsPayload, err := h.podsService.ListPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	deploymentsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "deployments")
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	statefulSetsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "statefulsets")
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	daemonSetsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "daemonsets")
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	cronJobsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "cronjobs")
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	recentEventsPayload, err := h.dashboardService.RecentEventsPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}

	var overview service.DashboardOverview
	var nodes []service.NodeListItem
	var pods []service.PodListItem
	var deployments []service.WorkloadItem
	var statefulSets []service.WorkloadItem
	var daemonSets []service.WorkloadItem
	var cronJobs []service.WorkloadItem
	var recentEvents []service.DashboardEvent

	if err := json.Unmarshal(overviewPayload, &overview); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(nodesPayload, &nodes); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(podsPayload, &pods); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(deploymentsPayload, &deployments); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(statefulSetsPayload, &statefulSets); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(daemonSetsPayload, &daemonSets); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(cronJobsPayload, &cronJobs); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	if err := json.Unmarshal(recentEventsPayload, &recentEvents); err != nil {
		return aiDiagnosisClusterStatus{}, err
	}

	connectionResult, err := h.k8sManager.CheckClusterSelection(ctx, clusterID)
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}

	clusterName := strings.TrimSpace(connectionResult.ClusterName)
	clusterRefID := strings.TrimSpace(connectionResult.ClusterID)
	if clusterName == "" && h.clusterStore != nil {
		cluster, clusterErr := h.lookupClusterForAI(ctx, clusterID)
		if clusterErr == nil && cluster != nil {
			clusterName = cluster.Name
			clusterRefID = cluster.ID
		}
	}
	if clusterName == "" {
		clusterName = "默认诊断上下文"
	}

	nodeHighlights := make([]aiDiagnosisNodeSummary, 0, len(nodes))
	for _, node := range nodes {
		nodeHighlights = append(nodeHighlights, aiDiagnosisNodeSummary{
			Name:        node.Name,
			Status:      node.Status,
			Schedulable: node.Schedulable,
			CPUUsage:    node.CPUUsage,
			MemoryUsage: node.MemoryUsage,
			Pods:        node.Pods,
			IP:          node.IP,
		})
	}
	sort.Slice(nodeHighlights, func(i, j int) bool {
		leftSeverity := nodeSeverity(nodeHighlights[i])
		rightSeverity := nodeSeverity(nodeHighlights[j])
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		if nodeHighlights[i].CPUUsage != nodeHighlights[j].CPUUsage {
			return nodeHighlights[i].CPUUsage > nodeHighlights[j].CPUUsage
		}
		return nodeHighlights[i].MemoryUsage > nodeHighlights[j].MemoryUsage
	})
	if len(nodeHighlights) > 5 {
		nodeHighlights = nodeHighlights[:5]
	}

	problemPods := make([]aiDiagnosisPodSummary, 0)
	for _, pod := range pods {
		status := strings.ToLower(strings.TrimSpace(pod.Status))
		if status == "running" || status == "succeeded" {
			continue
		}
		problemPods = append(problemPods, aiDiagnosisPodSummary{
			Namespace: pod.Namespace,
			Name:      pod.Name,
			Status:    pod.Status,
			Node:      pod.Node,
		})
	}
	sort.Slice(problemPods, func(i, j int) bool {
		if podSeverity(problemPods[i].Status) != podSeverity(problemPods[j].Status) {
			return podSeverity(problemPods[i].Status) > podSeverity(problemPods[j].Status)
		}
		if problemPods[i].Namespace != problemPods[j].Namespace {
			return problemPods[i].Namespace < problemPods[j].Namespace
		}
		return problemPods[i].Name < problemPods[j].Name
	})
	if len(problemPods) > 8 {
		problemPods = problemPods[:8]
	}

	workloadAlerts := buildAIDiagnosisWorkloadAlerts(deployments, "deployments")
	workloadAlerts = append(workloadAlerts, buildAIDiagnosisWorkloadAlerts(statefulSets, "statefulsets")...)
	workloadAlerts = append(workloadAlerts, buildAIDiagnosisWorkloadAlerts(daemonSets, "daemonsets")...)
	workloadAlerts = append(workloadAlerts, buildAIDiagnosisWorkloadAlerts(cronJobs, "cronjobs")...)
	sort.Slice(workloadAlerts, func(i, j int) bool {
		leftSeverity := workloadSeverity(workloadAlerts[i])
		rightSeverity := workloadSeverity(workloadAlerts[j])
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		if workloadAlerts[i].Namespace != workloadAlerts[j].Namespace {
			return workloadAlerts[i].Namespace < workloadAlerts[j].Namespace
		}
		return workloadAlerts[i].Name < workloadAlerts[j].Name
	})
	if len(workloadAlerts) > 8 {
		workloadAlerts = workloadAlerts[:8]
	}

	if len(recentEvents) > 6 {
		recentEvents = recentEvents[:6]
	}

	source := "snapshot"
	if connectionResult.Status == store.ConnectionStatusConnected {
		source = "live"
	}

	return aiDiagnosisClusterStatus{
		ClusterID:       clusterRefID,
		ClusterName:     clusterName,
		ConnectionState: connectionResult.Status,
		Source:          source,
		Overview:        overview,
		NodeHighlights:  nodeHighlights,
		ProblemPods:     problemPods,
		WorkloadAlerts:  workloadAlerts,
		RecentEvents:    recentEvents,
		GeneratedAt:     time.Now(),
	}, nil
}

func (h *handler) lookupClusterForAI(ctx context.Context, clusterID string) (*store.Cluster, error) {
	if h.clusterStore == nil {
		return nil, nil
	}
	if strings.TrimSpace(clusterID) != "" {
		return h.clusterStore.GetByID(ctx, clusterID)
	}
	return h.clusterStore.GetDefault(ctx)
}

func buildAIDiagnosisWorkloadAlerts(items []service.WorkloadItem, scope string) []aiDiagnosisWorkloadHint {
	alerts := make([]aiDiagnosisWorkloadHint, 0)
	for _, item := range items {
		if item.Paused || item.Ready != item.Desired || item.Available != item.Desired {
			alerts = append(alerts, aiDiagnosisWorkloadHint{
				Scope:     scope,
				Namespace: item.Namespace,
				Name:      item.Name,
				Ready:     item.Ready,
				Desired:   item.Desired,
				Available: item.Available,
				Paused:    item.Paused,
			})
		}
	}
	return alerts
}

func nodeSeverity(node aiDiagnosisNodeSummary) int {
	if strings.EqualFold(node.Status, "offline") {
		return 4
	}
	if strings.EqualFold(node.Status, "unknown") {
		return 3
	}
	if !node.Schedulable {
		return 2
	}
	if node.CPUUsage >= 80 || node.MemoryUsage >= 80 {
		return 2
	}
	if node.CPUUsage >= 60 || node.MemoryUsage >= 60 {
		return 1
	}
	return 0
}

func podSeverity(status string) int {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "failed":
		return 3
	case "pending":
		return 2
	case "paused":
		return 1
	default:
		return 0
	}
}

func workloadSeverity(item aiDiagnosisWorkloadHint) int {
	if item.Paused {
		return 3
	}
	if item.Ready == 0 && item.Desired > 0 {
		return 3
	}
	if item.Ready != item.Desired || item.Available != item.Desired {
		return 2
	}
	return 1
}

func truncateText(value string, maxRunes int) string {
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

func toAIDiagnosisConversationResponse(item store.AIConversation) aiDiagnosisConversationResponse {
	response := aiDiagnosisConversationResponse{
		ID:          item.ID,
		Title:       item.Title,
		Summary:     item.Summary,
		ClusterID:   item.ClusterID,
		ClusterName: item.ClusterName,
		ModelID:     item.ModelID,
		ModelName:   item.ModelName,
		CreatedAt:   item.CreatedAt,
		UpdatedAt:   item.UpdatedAt,
		Messages:    make([]aiDiagnosisMessageResponse, 0, len(item.Messages)),
	}

	for _, message := range item.Messages {
		response.Messages = append(response.Messages, aiDiagnosisMessageResponse{
			ID:        message.ID,
			Role:      message.Role,
			Content:   message.Content,
			CreatedAt: message.CreatedAt,
		})
	}

	return response
}
