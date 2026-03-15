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
	TemplateID     string `json:"templateId,omitempty"`
}

type aiDiagnosisPreparedInput struct {
	Payload              aiDiagnosisChatRequest
	Model                aiModelPayload
	Template             *aiDiagnosisTemplatePayload
	ExistingConversation *store.AIConversation
	Bundle               aiDiagnosisBundle
}

type aiDiagnosisExecutionResult struct {
	Conversation aiDiagnosisConversationResponse `json:"conversation"`
	Cluster      aiDiagnosisClusterStatus        `json:"cluster"`
	Report       *aiDiagnosisReport              `json:"report,omitempty"`
}

type aiDiagnosisConversationResponse struct {
	ID          string                       `json:"id"`
	Title       string                       `json:"title"`
	Summary     string                       `json:"summary"`
	ClusterID   string                       `json:"clusterId,omitempty"`
	ClusterName string                       `json:"clusterName,omitempty"`
	ModelID     string                       `json:"modelId,omitempty"`
	ModelName   string                       `json:"modelName,omitempty"`
	CreatedAt   time.Time                    `json:"createdAt"`
	UpdatedAt   time.Time                    `json:"updatedAt"`
	Messages    []aiDiagnosisMessageResponse `json:"messages,omitempty"`
}

type aiDiagnosisMessageResponse struct {
	ID        string                      `json:"id"`
	Role      string                      `json:"role"`
	Content   string                      `json:"content"`
	Metadata  *aiDiagnosisMessageMetadata `json:"metadata,omitempty"`
	CreatedAt time.Time                   `json:"createdAt"`
}

type aiDiagnosisMessageMetadata struct {
	TemplateID string             `json:"templateId,omitempty"`
	Report     *aiDiagnosisReport `json:"report,omitempty"`
}

type aiDiagnosisChatResponse struct {
	Conversation aiDiagnosisConversationResponse `json:"conversation"`
	Cluster      aiDiagnosisClusterStatus        `json:"cluster"`
	Report       *aiDiagnosisReport              `json:"report,omitempty"`
}

type aiDiagnosisBundle struct {
	Status       aiDiagnosisClusterStatus
	Nodes        []service.NodeListItem
	Pods         []service.PodListItem
	Deployments  []service.WorkloadItem
	StatefulSets []service.WorkloadItem
	DaemonSets   []service.WorkloadItem
	CronJobs     []service.WorkloadItem
	RecentEvents []service.DashboardEvent
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

func (h *handler) listAIDiagnosisTemplates(w http.ResponseWriter, r *http.Request) error {
	writeJSON(w, http.StatusOK, aiDiagnosisTemplates())
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

	prepared, err := h.prepareAIDiagnosisRequest(r.Context(), payload)
	if err != nil {
		return err
	}

	result, err := h.executeAIDiagnosis(r.Context(), prepared, nil)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, aiDiagnosisChatResponse{
		Conversation: result.Conversation,
		Cluster:      result.Cluster,
		Report:       result.Report,
	})
	return nil
}

func (h *handler) aiDiagnosisChatStream(w http.ResponseWriter, r *http.Request) error {
	var payload aiDiagnosisChatRequest
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	prepared, err := h.prepareAIDiagnosisRequest(r.Context(), payload)
	if err != nil {
		return err
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		return newHTTPError(http.StatusInternalServerError, "当前服务不支持流式输出")
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	_ = writeSSEEvent(w, "context", map[string]any{
		"cluster":  prepared.Bundle.Status,
		"template": prepared.Template,
	})
	flusher.Flush()

	result, err := h.executeAIDiagnosis(r.Context(), prepared, func(delta string) error {
		if strings.TrimSpace(delta) == "" {
			return nil
		}
		if err := writeSSEEvent(w, "delta", map[string]string{"content": delta}); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	})
	if err != nil {
		_ = writeSSEEvent(w, "error", map[string]string{"message": err.Error()})
		flusher.Flush()
		return nil
	}

	_ = writeSSEEvent(w, "done", aiDiagnosisChatResponse{
		Conversation: result.Conversation,
		Cluster:      result.Cluster,
		Report:       result.Report,
	})
	flusher.Flush()
	return nil
}

func (h *handler) prepareAIDiagnosisRequest(
	ctx context.Context,
	payload aiDiagnosisChatRequest,
) (aiDiagnosisPreparedInput, error) {
	payload.Message = strings.TrimSpace(payload.Message)
	payload.TemplateID = strings.TrimSpace(payload.TemplateID)
	payload.ClusterID = strings.TrimSpace(payload.ClusterID)
	payload.ConversationID = strings.TrimSpace(payload.ConversationID)

	var template *aiDiagnosisTemplatePayload
	if payload.TemplateID != "" {
		nextTemplate, ok := aiDiagnosisTemplateByID(payload.TemplateID)
		if !ok {
			return aiDiagnosisPreparedInput{}, newHTTPError(http.StatusBadRequest, "诊断模板不存在")
		}
		template = &nextTemplate
		if payload.Message == "" {
			payload.Message = nextTemplate.Prompt
		}
	}

	if payload.Message == "" {
		return aiDiagnosisPreparedInput{}, newHTTPError(http.StatusBadRequest, "message is required")
	}

	model, err := h.defaultAIDiagnosisModel(ctx)
	if err != nil {
		return aiDiagnosisPreparedInput{}, newHTTPError(http.StatusBadRequest, err.Error())
	}

	var existingConversation *store.AIConversation
	if payload.ConversationID != "" && h.aiHistoryStore != nil {
		existingConversation, err = h.aiHistoryStore.Get(ctx, payload.ConversationID)
		if errors.Is(err, store.ErrAIConversationNotFound) {
			return aiDiagnosisPreparedInput{}, newHTTPError(http.StatusNotFound, "会话不存在")
		}
		if err != nil {
			return aiDiagnosisPreparedInput{}, err
		}

		if payload.ClusterID == "" {
			payload.ClusterID = existingConversation.ClusterID
		} else if existingConversation.ClusterID != "" && existingConversation.ClusterID != payload.ClusterID {
			return aiDiagnosisPreparedInput{}, newHTTPError(http.StatusBadRequest, "所选会话与当前分析集群不一致，请新建会话后重试")
		}
	}

	bundle, err := h.buildAIDiagnosisBundle(ctx, payload.ClusterID)
	if err != nil {
		return aiDiagnosisPreparedInput{}, err
	}

	if payload.ClusterID == "" {
		payload.ClusterID = bundle.Status.ClusterID
	}

	return aiDiagnosisPreparedInput{
		Payload:              payload,
		Model:                model,
		Template:             template,
		ExistingConversation: existingConversation,
		Bundle:               bundle,
	}, nil
}

func (h *handler) executeAIDiagnosis(
	ctx context.Context,
	prepared aiDiagnosisPreparedInput,
	onDelta func(string) error,
) (aiDiagnosisExecutionResult, error) {
	report := h.buildAIDiagnosisReport(ctx, prepared.Bundle, prepared.Payload.Message, prepared.Template)

	messages, err := h.buildAIDiagnosisLLMMessages(prepared, report)
	if err != nil {
		return aiDiagnosisExecutionResult{}, err
	}

	chatCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	var answer string
	if onDelta != nil {
		answer, err = h.llmClient.streamChatCompletion(chatCtx, prepared.Model, messages, onDelta)
	} else {
		answer, err = h.llmClient.chatCompletion(chatCtx, prepared.Model, messages)
	}
	if err != nil {
		return aiDiagnosisExecutionResult{}, newHTTPError(http.StatusBadGateway, fmt.Sprintf("调用 AI 服务失败: %s", err.Error()))
	}

	report.Summary = coalesceString(report.Summary, truncateText(answer, 120))
	assistantMetadata := aiDiagnosisMessageMetadata{
		TemplateID: prepared.Payload.TemplateID,
		Report:     &report,
	}
	userMetadata := aiDiagnosisMessageMetadata{
		TemplateID: prepared.Payload.TemplateID,
	}

	if h.aiHistoryStore == nil {
		now := time.Now()
		conversation := buildLocalAIDiagnosisConversation(prepared, answer, report, userMetadata, assistantMetadata, now)
		return aiDiagnosisExecutionResult{
			Conversation: conversation,
			Cluster:      prepared.Bundle.Status,
			Report:       &report,
		}, nil
	}

	userMetadataJSON, err := json.Marshal(userMetadata)
	if err != nil {
		return aiDiagnosisExecutionResult{}, err
	}
	assistantMetadataJSON, err := json.Marshal(assistantMetadata)
	if err != nil {
		return aiDiagnosisExecutionResult{}, err
	}

	savedConversation, err := h.aiHistoryStore.SaveExchange(ctx, store.SaveAIConversationInput{
		ConversationID:    prepared.Payload.ConversationID,
		Title:             buildAIDiagnosisConversationTitle(prepared.Payload.Message, prepared.Template),
		Summary:           report.Summary,
		ClusterID:         prepared.Bundle.Status.ClusterID,
		ClusterName:       prepared.Bundle.Status.ClusterName,
		ModelID:           prepared.Model.ID,
		ModelName:         prepared.Model.Name,
		UserMessage:       prepared.Payload.Message,
		AssistantMessage:  answer,
		UserMetadata:      userMetadataJSON,
		AssistantMetadata: assistantMetadataJSON,
	})
	if err != nil {
		return aiDiagnosisExecutionResult{}, err
	}

	return aiDiagnosisExecutionResult{
		Conversation: toAIDiagnosisConversationResponse(*savedConversation),
		Cluster:      prepared.Bundle.Status,
		Report:       findLatestAssistantReport(savedConversation.Messages),
	}, nil
}

func (h *handler) buildAIDiagnosisLLMMessages(
	prepared aiDiagnosisPreparedInput,
	report aiDiagnosisReport,
) ([]llmChatMessage, error) {
	messages := []llmChatMessage{
		{
			Role: "system",
			Content: strings.TrimSpace(`你是 K8s Agent 的 Kubernetes 智能诊断助手。
请始终使用中文回答，语气专业、直接、可执行。
你只能依据提供的集群上下文、诊断报告骨架和用户问题作答，不能编造不存在的节点、Pod、事件、日志或指标。
如果证据不足，请明确说明“当前证据不足，需要补充信息”。
如果涉及集群操作，只能给出建议步骤、风险和验证方法，不能声称已经替用户执行。
请按以下结构输出：
1. 结论
2. 关键证据
3. 优先处理建议
4. 下一步检查`),
		},
	}

	if prepared.Template != nil {
		templateJSON, err := json.MarshalIndent(prepared.Template, "", "  ")
		if err != nil {
			return nil, err
		}
		messages = append(messages, llmChatMessage{
			Role:    "system",
			Content: "当前诊断模板如下，请优先结合模板目标进行判断：\n" + string(templateJSON),
		})
	}

	contextJSON, err := json.MarshalIndent(map[string]any{
		"cluster": prepared.Bundle.Status,
		"report":  report,
	}, "", "  ")
	if err != nil {
		return nil, err
	}

	messages = append(messages, llmChatMessage{
		Role:    "system",
		Content: "当前诊断上下文如下，只能基于这些内容输出结论：\n" + string(contextJSON),
	})

	if prepared.ExistingConversation != nil {
		for _, message := range prepared.ExistingConversation.Messages {
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
		Content: prepared.Payload.Message,
	})

	return messages, nil
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

func (h *handler) buildAIDiagnosisBundle(ctx context.Context, clusterID string) (aiDiagnosisBundle, error) {
	overviewPayload, err := h.dashboardService.OverviewPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	nodesPayload, err := h.nodesService.ListPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	podsPayload, err := h.podsService.ListPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	deploymentsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "deployments")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	statefulSetsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "statefulsets")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	daemonSetsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "daemonsets")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	cronJobsPayload, err := h.workloadsService.ListPayload(ctx, clusterID, "cronjobs")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	recentEventsPayload, err := h.dashboardService.RecentEventsPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
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
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(nodesPayload, &nodes); err != nil {
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(podsPayload, &pods); err != nil {
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(deploymentsPayload, &deployments); err != nil {
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(statefulSetsPayload, &statefulSets); err != nil {
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(daemonSetsPayload, &daemonSets); err != nil {
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(cronJobsPayload, &cronJobs); err != nil {
		return aiDiagnosisBundle{}, err
	}
	if err := json.Unmarshal(recentEventsPayload, &recentEvents); err != nil {
		return aiDiagnosisBundle{}, err
	}

	connectionResult, err := h.k8sManager.CheckClusterSelection(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
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
		leftSeverity := podSeverity(problemPods[i].Status)
		rightSeverity := podSeverity(problemPods[j].Status)
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		if problemPods[i].Namespace != problemPods[j].Namespace {
			return problemPods[i].Namespace < problemPods[j].Namespace
		}
		return problemPods[i].Name < problemPods[j].Name
	})

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

	source := "snapshot"
	if connectionResult.Status == store.ConnectionStatusConnected {
		source = "live"
	}

	statusEvents := recentEvents
	if len(statusEvents) > 6 {
		statusEvents = statusEvents[:6]
	}
	statusNodes := nodeHighlights
	if len(statusNodes) > 5 {
		statusNodes = statusNodes[:5]
	}
	statusPods := problemPods
	if len(statusPods) > 8 {
		statusPods = statusPods[:8]
	}
	statusWorkloads := workloadAlerts
	if len(statusWorkloads) > 8 {
		statusWorkloads = statusWorkloads[:8]
	}

	return aiDiagnosisBundle{
		Status: aiDiagnosisClusterStatus{
			ClusterID:       clusterRefID,
			ClusterName:     clusterName,
			ConnectionState: connectionResult.Status,
			Source:          source,
			Overview:        overview,
			NodeHighlights:  statusNodes,
			ProblemPods:     statusPods,
			WorkloadAlerts:  statusWorkloads,
			RecentEvents:    statusEvents,
			GeneratedAt:     time.Now(),
		},
		Nodes:        nodes,
		Pods:         pods,
		Deployments:  deployments,
		StatefulSets: statefulSets,
		DaemonSets:   daemonSets,
		CronJobs:     cronJobs,
		RecentEvents: recentEvents,
	}, nil
}

func (h *handler) buildAIDiagnosisClusterStatus(ctx context.Context, clusterID string) (aiDiagnosisClusterStatus, error) {
	bundle, err := h.buildAIDiagnosisBundle(ctx, clusterID)
	if err != nil {
		return aiDiagnosisClusterStatus{}, err
	}
	return bundle.Status, nil
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
	if node.CPUUsage >= 90 || node.MemoryUsage >= 90 {
		return 3
	}
	if node.CPUUsage >= 75 || node.MemoryUsage >= 75 {
		return 2
	}
	if node.CPUUsage >= 60 || node.MemoryUsage >= 60 {
		return 1
	}
	return 0
}

func podSeverity(status string) int {
	normalized := strings.ToLower(strings.TrimSpace(status))
	switch {
	case strings.Contains(normalized, "crashloopbackoff"),
		strings.Contains(normalized, "imagepullbackoff"),
		strings.Contains(normalized, "errimagepull"),
		strings.Contains(normalized, "failed"):
		return 4
	case strings.Contains(normalized, "pending"):
		return 3
	case strings.Contains(normalized, "terminating"),
		strings.Contains(normalized, "containercreating"):
		return 2
	default:
		return 0
	}
}

func workloadSeverity(item aiDiagnosisWorkloadHint) int {
	if item.Paused {
		return 3
	}
	if item.Ready == 0 && item.Desired > 0 {
		return 4
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

func buildAIDiagnosisConversationTitle(message string, template *aiDiagnosisTemplatePayload) string {
	message = strings.TrimSpace(message)
	if template != nil && (message == "" || message == template.Prompt) {
		return template.Title
	}
	if template != nil && message != "" {
		return truncateText(template.Title+" - "+message, 36)
	}
	return truncateText(message, 36)
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
			Metadata:  decodeAIDiagnosisMessageMetadata(message.Metadata),
			CreatedAt: message.CreatedAt,
		})
	}

	return response
}

func decodeAIDiagnosisMessageMetadata(raw json.RawMessage) *aiDiagnosisMessageMetadata {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "{}" || trimmed == "null" {
		return nil
	}

	var metadata aiDiagnosisMessageMetadata
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return nil
	}
	if metadata.TemplateID == "" && metadata.Report == nil {
		return nil
	}
	return &metadata
}

func findLatestAssistantReport(messages []store.AIConversationMsg) *aiDiagnosisReport {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Role != "assistant" {
			continue
		}
		metadata := decodeAIDiagnosisMessageMetadata(messages[index].Metadata)
		if metadata != nil && metadata.Report != nil {
			return metadata.Report
		}
	}
	return nil
}

func buildLocalAIDiagnosisConversation(
	prepared aiDiagnosisPreparedInput,
	answer string,
	report aiDiagnosisReport,
	userMetadata aiDiagnosisMessageMetadata,
	assistantMetadata aiDiagnosisMessageMetadata,
	now time.Time,
) aiDiagnosisConversationResponse {
	return aiDiagnosisConversationResponse{
		ID:          "",
		Title:       buildAIDiagnosisConversationTitle(prepared.Payload.Message, prepared.Template),
		Summary:     report.Summary,
		ClusterID:   prepared.Bundle.Status.ClusterID,
		ClusterName: prepared.Bundle.Status.ClusterName,
		ModelID:     prepared.Model.ID,
		ModelName:   prepared.Model.Name,
		CreatedAt:   now,
		UpdatedAt:   now,
		Messages: []aiDiagnosisMessageResponse{
			{
				ID:        "local-user",
				Role:      "user",
				Content:   prepared.Payload.Message,
				Metadata:  &userMetadata,
				CreatedAt: now,
			},
			{
				ID:        "local-assistant",
				Role:      "assistant",
				Content:   answer,
				Metadata:  &assistantMetadata,
				CreatedAt: now,
			},
		},
	}
}

func writeSSEEvent(w http.ResponseWriter, event string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", event); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", body); err != nil {
		return err
	}
	return nil
}

func coalesceString(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}
	return strings.TrimSpace(fallback)
}
