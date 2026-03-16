package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
)

type aiDiagnosisIssueResponse struct {
	ID              string                `json:"id"`
	IssueKey        string                `json:"issueKey"`
	ClusterID       string                `json:"clusterId,omitempty"`
	ClusterName     string                `json:"clusterName,omitempty"`
	Category        string                `json:"category"`
	Title           string                `json:"title"`
	Summary         string                `json:"summary"`
	RiskLevel       string                `json:"riskLevel"`
	Score           int                   `json:"score"`
	AffectedCount   int                   `json:"affectedCount"`
	OccurrenceCount int                   `json:"occurrenceCount"`
	Status          string                `json:"status"`
	Note            string                `json:"note,omitempty"`
	SourceID        string                `json:"sourceId,omitempty"`
	Target          *aiDiagnosisTargetRef `json:"target,omitempty"`
	Evidence        []aiDiagnosisEvidence `json:"evidence,omitempty"`
	Actions         []aiDiagnosisAction   `json:"actions,omitempty"`
	AcknowledgedAt  string                `json:"acknowledgedAt,omitempty"`
	SilencedUntil   string                `json:"silencedUntil,omitempty"`
	EscalationLevel string                `json:"escalationLevel,omitempty"`
	EscalatedAt     string                `json:"escalatedAt,omitempty"`
	FirstDetectedAt string                `json:"firstDetectedAt"`
	LastDetectedAt  string                `json:"lastDetectedAt"`
	ResolvedAt      string                `json:"resolvedAt,omitempty"`
	UpdatedAt       string                `json:"updatedAt"`
}

type aiDiagnosisIssueListResponse struct {
	Items    []aiDiagnosisIssueResponse `json:"items"`
	Total    int                        `json:"total"`
	Page     int                        `json:"page"`
	PageSize int                        `json:"pageSize"`
}

type aiDiagnosisIssueStatusRequest struct {
	Note            string `json:"note"`
	SilenceMinutes  int    `json:"silenceMinutes"`
	EscalationLevel string `json:"escalationLevel"`
}

type aiDiagnosisMemoryResponse struct {
	ID                string          `json:"id"`
	ClusterID         string          `json:"clusterId,omitempty"`
	ClusterName       string          `json:"clusterName,omitempty"`
	SourceType        string          `json:"sourceType"`
	SourceID          string          `json:"sourceId,omitempty"`
	ResourceKind      string          `json:"resourceKind,omitempty"`
	ResourceScope     string          `json:"resourceScope,omitempty"`
	ResourceNamespace string          `json:"resourceNamespace,omitempty"`
	ResourceName      string          `json:"resourceName,omitempty"`
	FeedbackLabel     string          `json:"feedbackLabel,omitempty"`
	Title             string          `json:"title"`
	Summary           string          `json:"summary"`
	Tags              json.RawMessage `json:"tags,omitempty"`
	Payload           json.RawMessage `json:"payload,omitempty"`
	CreatedAt         string          `json:"createdAt"`
	UpdatedAt         string          `json:"updatedAt"`
}

type aiDiagnosisMemoryFeedbackRequest struct {
	ClusterID      string                `json:"clusterId"`
	ConversationID string                `json:"conversationId"`
	MessageID      string                `json:"messageId"`
	FeedbackLabel  string                `json:"feedbackLabel"`
	Title          string                `json:"title"`
	Summary        string                `json:"summary"`
	Note           string                `json:"note"`
	Target         *aiDiagnosisTargetRef `json:"target"`
}

type aiDiagnosisTemplateMutationRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Prompt      string `json:"prompt"`
}

func (h *handler) listAvailableAIDiagnosisTemplates(ctx context.Context) ([]aiDiagnosisTemplatePayload, error) {
	items := aiDiagnosisTemplates()
	if h.aiTemplateStore == nil {
		return items, nil
	}

	customTemplates, err := h.aiTemplateStore.List(ctx)
	if err != nil {
		return nil, err
	}

	for _, item := range customTemplates {
		items = append(items, aiDiagnosisTemplatePayload{
			ID:          item.ID,
			Title:       item.Title,
			Description: item.Description,
			Category:    item.Category,
			Prompt:      item.Prompt,
			Source:      "custom",
			Editable:    true,
		})
	}

	return items, nil
}

func (h *handler) lookupAIDiagnosisTemplate(ctx context.Context, id string) (*aiDiagnosisTemplatePayload, error) {
	if builtIn, ok := aiDiagnosisTemplateByID(id); ok {
		return &builtIn, nil
	}
	if h.aiTemplateStore == nil {
		return nil, newHTTPError(http.StatusNotFound, "诊断模板不存在")
	}

	item, err := h.aiTemplateStore.Get(ctx, id)
	if errors.Is(err, store.ErrAITemplateNotFound) {
		return nil, newHTTPError(http.StatusNotFound, "诊断模板不存在")
	}
	if err != nil {
		return nil, err
	}

	return &aiDiagnosisTemplatePayload{
		ID:          item.ID,
		Title:       item.Title,
		Description: item.Description,
		Category:    item.Category,
		Prompt:      item.Prompt,
		Source:      "custom",
		Editable:    true,
	}, nil
}

func (h *handler) createAIDiagnosisTemplate(w http.ResponseWriter, r *http.Request) error {
	if h.aiTemplateStore == nil {
		return newHTTPError(http.StatusNotImplemented, "模板中心未启用")
	}

	var payload aiDiagnosisTemplateMutationRequest
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	item, err := h.aiTemplateStore.Save(r.Context(), store.SaveAITemplateInput{
		Title:       strings.TrimSpace(payload.Title),
		Description: strings.TrimSpace(payload.Description),
		Category:    strings.TrimSpace(payload.Category),
		Prompt:      strings.TrimSpace(payload.Prompt),
	})
	if err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "ai.template.create",
		ResourceType: "ai-template",
		ResourceName: item.Title,
		Status:       store.AuditStatusSuccess,
		Message:      "已创建 AI 诊断模板",
		Details: map[string]any{
			"id":       item.ID,
			"category": item.Category,
		},
	})

	writeJSON(w, http.StatusCreated, aiDiagnosisTemplatePayload{
		ID:          item.ID,
		Title:       item.Title,
		Description: item.Description,
		Category:    item.Category,
		Prompt:      item.Prompt,
		Source:      "custom",
		Editable:    true,
	})
	return nil
}

func (h *handler) updateAIDiagnosisTemplate(w http.ResponseWriter, r *http.Request) error {
	if h.aiTemplateStore == nil {
		return newHTTPError(http.StatusNotImplemented, "模板中心未启用")
	}

	var payload aiDiagnosisTemplateMutationRequest
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	item, err := h.aiTemplateStore.Save(r.Context(), store.SaveAITemplateInput{
		ID:          chi.URLParam(r, "id"),
		Title:       strings.TrimSpace(payload.Title),
		Description: strings.TrimSpace(payload.Description),
		Category:    strings.TrimSpace(payload.Category),
		Prompt:      strings.TrimSpace(payload.Prompt),
	})
	if err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "ai.template.update",
		ResourceType: "ai-template",
		ResourceName: item.Title,
		Status:       store.AuditStatusSuccess,
		Message:      "已更新 AI 诊断模板",
		Details: map[string]any{
			"id":       item.ID,
			"category": item.Category,
		},
	})

	writeJSON(w, http.StatusOK, aiDiagnosisTemplatePayload{
		ID:          item.ID,
		Title:       item.Title,
		Description: item.Description,
		Category:    item.Category,
		Prompt:      item.Prompt,
		Source:      "custom",
		Editable:    true,
	})
	return nil
}

func (h *handler) deleteAIDiagnosisTemplate(w http.ResponseWriter, r *http.Request) error {
	if h.aiTemplateStore == nil {
		return newHTTPError(http.StatusNotImplemented, "模板中心未启用")
	}

	templateID := strings.TrimSpace(chi.URLParam(r, "id"))
	item, err := h.aiTemplateStore.Get(r.Context(), templateID)
	if errors.Is(err, store.ErrAITemplateNotFound) {
		return newHTTPError(http.StatusNotFound, "诊断模板不存在")
	}
	if err != nil {
		return err
	}

	if err := h.aiTemplateStore.Delete(r.Context(), templateID); err != nil {
		if errors.Is(err, store.ErrAITemplateNotFound) {
			return newHTTPError(http.StatusNotFound, "诊断模板不存在")
		}
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "ai.template.delete",
		ResourceType: "ai-template",
		ResourceName: item.Title,
		Status:       store.AuditStatusSuccess,
		Message:      "已删除 AI 诊断模板",
	})

	writeJSON(w, http.StatusOK, map[string]string{"message": "模板已删除"})
	return nil
}

func (h *handler) listAIIssues(w http.ResponseWriter, r *http.Request) error {
	if h.aiIssueStore == nil {
		writeJSON(w, http.StatusOK, aiDiagnosisIssueListResponse{Items: []aiDiagnosisIssueResponse{}, Page: 1, PageSize: 12})
		return nil
	}

	result, err := h.aiIssueStore.List(r.Context(), store.AIIssueFilter{
		ClusterID: requestedClusterID(r),
		Status:    strings.TrimSpace(r.URL.Query().Get("status")),
		RiskLevel: strings.TrimSpace(r.URL.Query().Get("riskLevel")),
		Query:     strings.TrimSpace(r.URL.Query().Get("query")),
		Page:      parseIntQueryParam(r, "page", 1),
		PageSize:  parseIntQueryParam(r, "limit", 12),
	})
	if err != nil {
		return err
	}

	items := make([]aiDiagnosisIssueResponse, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, toAIDiagnosisIssueResponse(item))
	}

	writeJSON(w, http.StatusOK, aiDiagnosisIssueListResponse{
		Items:    items,
		Total:    result.Total,
		Page:     result.Page,
		PageSize: result.PageSize,
	})
	return nil
}

func (h *handler) getAIIssue(w http.ResponseWriter, r *http.Request) error {
	if h.aiIssueStore == nil {
		return newHTTPError(http.StatusNotFound, "问题不存在")
	}

	item, err := h.aiIssueStore.Get(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, store.ErrAIIssueNotFound) {
		return newHTTPError(http.StatusNotFound, "问题不存在")
	}
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, toAIDiagnosisIssueResponse(*item))
	return nil
}

func (h *handler) followAIIssue(w http.ResponseWriter, r *http.Request) error {
	return h.updateAIIssueStatus(w, r, store.AIIssueStatusFollowing, "ai.issue.follow", "问题已加入持续跟踪")
}

func (h *handler) resolveAIIssue(w http.ResponseWriter, r *http.Request) error {
	return h.updateAIIssueStatus(w, r, store.AIIssueStatusResolved, "ai.issue.resolve", "问题已标记为已恢复")
}

func (h *handler) updateAIIssueStatus(w http.ResponseWriter, r *http.Request, status string, action string, successMessage string) error {
	if h.aiIssueStore == nil {
		return newHTTPError(http.StatusNotFound, "问题不存在")
	}

	var payload aiDiagnosisIssueStatusRequest
	if err := decodeJSON(r, &payload); err != nil && !errors.Is(err, io.EOF) {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	item, err := h.aiIssueStore.UpdateStatus(r.Context(), chi.URLParam(r, "id"), status, payload.Note)
	if errors.Is(err, store.ErrAIIssueNotFound) {
		return newHTTPError(http.StatusNotFound, "问题不存在")
	}
	if err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       action,
		ResourceType: "ai-issue",
		ResourceName: item.Title,
		ClusterID:    item.ClusterID,
		ClusterName:  item.ClusterName,
		Status:       store.AuditStatusSuccess,
		Message:      successMessage,
		Details: map[string]any{
			"id":     item.ID,
			"status": item.Status,
			"note":   strings.TrimSpace(payload.Note),
		},
	})

	if status == store.AIIssueStatusResolved && h.aiMemoryStore != nil {
		_, _ = h.aiMemoryStore.Save(r.Context(), store.SaveAIMemoryInput{
			ClusterID:         item.ClusterID,
			ClusterName:       item.ClusterName,
			SourceType:        "issue-resolution",
			SourceID:          item.ID,
			ResourceKind:      extractTargetKind(item.Target),
			ResourceScope:     extractTargetScope(item.Target),
			ResourceNamespace: extractTargetNamespace(item.Target),
			ResourceName:      extractTargetName(item.Target),
			FeedbackLabel:     "resolved",
			Title:             "问题复盘：" + item.Title,
			Summary:           coalesceString(strings.TrimSpace(payload.Note), item.Summary),
			Payload:           map[string]any{"issue": toAIDiagnosisIssueResponse(*item)},
		})
	}

	writeJSON(w, http.StatusOK, toAIDiagnosisIssueResponse(*item))
	return nil
}

func (h *handler) listAIMemories(w http.ResponseWriter, r *http.Request) error {
	if h.aiMemoryStore == nil {
		writeJSON(w, http.StatusOK, []aiDiagnosisMemoryResponse{})
		return nil
	}

	items, err := h.aiMemoryStore.List(r.Context(), store.AIMemoryFilter{
		ClusterID:  requestedClusterID(r),
		Query:      strings.TrimSpace(r.URL.Query().Get("query")),
		SourceType: strings.TrimSpace(r.URL.Query().Get("sourceType")),
		Limit:      parseIntQueryParam(r, "limit", 20),
	})
	if err != nil {
		return err
	}

	response := make([]aiDiagnosisMemoryResponse, 0, len(items))
	for _, item := range items {
		response = append(response, toAIMemoryResponse(item))
	}
	writeJSON(w, http.StatusOK, response)
	return nil
}

func (h *handler) listAIMemoriesByResource(w http.ResponseWriter, r *http.Request) error {
	if h.aiMemoryStore == nil {
		writeJSON(w, http.StatusOK, []aiDiagnosisMemoryResponse{})
		return nil
	}

	items, err := h.aiMemoryStore.ListByResource(r.Context(), store.AIMemoryResourceFilter{
		ClusterID:         requestedClusterID(r),
		ResourceKind:      strings.TrimSpace(r.URL.Query().Get("kind")),
		ResourceScope:     strings.TrimSpace(r.URL.Query().Get("scope")),
		ResourceNamespace: strings.TrimSpace(r.URL.Query().Get("namespace")),
		ResourceName:      strings.TrimSpace(r.URL.Query().Get("name")),
		Limit:             parseIntQueryParam(r, "limit", 10),
	})
	if err != nil {
		return err
	}

	response := make([]aiDiagnosisMemoryResponse, 0, len(items))
	for _, item := range items {
		response = append(response, toAIMemoryResponse(item))
	}
	writeJSON(w, http.StatusOK, response)
	return nil
}

func (h *handler) saveAIMemoryFeedback(w http.ResponseWriter, r *http.Request) error {
	if h.aiMemoryStore == nil {
		return newHTTPError(http.StatusNotImplemented, "诊断记忆未启用")
	}

	var payload aiDiagnosisMemoryFeedbackRequest
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	clusterID := strings.TrimSpace(payload.ClusterID)
	clusterName := ""
	if clusterID != "" && h.clusterStore != nil {
		cluster, err := h.clusterStore.GetByID(r.Context(), clusterID)
		if err == nil && cluster != nil {
			clusterName = cluster.Name
		}
	}

	sourceID := strings.TrimSpace(payload.ConversationID)
	if sourceID == "" && strings.TrimSpace(payload.MessageID) != "" {
		sourceID = "message-" + strings.TrimSpace(payload.MessageID)
	}
	if sourceID == "" {
		sourceID = "feedback-" + strings.TrimSpace(payload.Title)
	}

	item, err := h.aiMemoryStore.Save(r.Context(), store.SaveAIMemoryInput{
		ClusterID:         clusterID,
		ClusterName:       clusterName,
		SourceType:        "feedback",
		SourceID:          sourceID,
		ResourceKind:      normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Kind }),
		ResourceScope:     normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Scope }),
		ResourceNamespace: normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Namespace }),
		ResourceName:      normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Name }),
		FeedbackLabel:     coalesceString(strings.TrimSpace(payload.FeedbackLabel), "helpful"),
		Title:             coalesceString(strings.TrimSpace(payload.Title), "AI 诊断反馈"),
		Summary:           coalesceString(strings.TrimSpace(payload.Note), strings.TrimSpace(payload.Summary)),
		Payload: map[string]any{
			"conversationId": strings.TrimSpace(payload.ConversationID),
			"messageId":      strings.TrimSpace(payload.MessageID),
			"summary":        strings.TrimSpace(payload.Summary),
			"target":         payload.Target,
		},
		Tags: []string{coalesceString(strings.TrimSpace(payload.FeedbackLabel), "helpful")},
	})
	if err != nil {
		return err
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "ai.memory.feedback",
		ResourceType: "ai-memory",
		ResourceName: item.Title,
		ClusterID:    item.ClusterID,
		ClusterName:  item.ClusterName,
		Status:       store.AuditStatusSuccess,
		Message:      "已保存 AI 诊断反馈",
		Details: map[string]any{
			"id":            item.ID,
			"feedbackLabel": item.FeedbackLabel,
		},
	})

	writeJSON(w, http.StatusOK, toAIMemoryResponse(*item))
	return nil
}

func toAIDiagnosisIssueResponse(item store.AIIssue) aiDiagnosisIssueResponse {
	var (
		target   *aiDiagnosisTargetRef
		evidence []aiDiagnosisEvidence
		actions  []aiDiagnosisAction
	)
	_ = decodeJSONBytes(item.Target, &target)
	_ = decodeJSONBytes(item.Evidence, &evidence)
	_ = decodeJSONBytes(item.Actions, &actions)

	response := aiDiagnosisIssueResponse{
		ID:              item.ID,
		IssueKey:        item.IssueKey,
		ClusterID:       item.ClusterID,
		ClusterName:     item.ClusterName,
		Category:        item.Category,
		Title:           item.Title,
		Summary:         item.Summary,
		RiskLevel:       item.RiskLevel,
		Score:           item.Score,
		AffectedCount:   item.AffectedCount,
		OccurrenceCount: item.OccurrenceCount,
		Status:          item.Status,
		Note:            item.Note,
		SourceID:        item.SourceID,
		Target:          target,
		Evidence:        evidence,
		Actions:         actions,
		FirstDetectedAt: item.FirstDetectedAt.Format(time.RFC3339),
		LastDetectedAt:  item.LastDetectedAt.Format(time.RFC3339),
		UpdatedAt:       item.UpdatedAt.Format(time.RFC3339),
	}
	if item.AcknowledgedAt != nil {
		response.AcknowledgedAt = item.AcknowledgedAt.Format(time.RFC3339)
	}
	if item.SilencedUntil != nil {
		response.SilencedUntil = item.SilencedUntil.Format(time.RFC3339)
	}
	if strings.TrimSpace(item.EscalationLevel) != "" {
		response.EscalationLevel = item.EscalationLevel
	}
	if item.EscalatedAt != nil {
		response.EscalatedAt = item.EscalatedAt.Format(time.RFC3339)
	}
	if item.ResolvedAt != nil {
		response.ResolvedAt = item.ResolvedAt.Format(time.RFC3339)
	}
	return response
}

func toAIMemoryResponse(item store.AIMemory) aiDiagnosisMemoryResponse {
	return aiDiagnosisMemoryResponse{
		ID:                item.ID,
		ClusterID:         item.ClusterID,
		ClusterName:       item.ClusterName,
		SourceType:        item.SourceType,
		SourceID:          item.SourceID,
		ResourceKind:      item.ResourceKind,
		ResourceScope:     item.ResourceScope,
		ResourceNamespace: item.ResourceNamespace,
		ResourceName:      item.ResourceName,
		FeedbackLabel:     item.FeedbackLabel,
		Title:             item.Title,
		Summary:           item.Summary,
		Tags:              item.Tags,
		Payload:           item.Payload,
		CreatedAt:         item.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         item.UpdatedAt.Format(time.RFC3339),
	}
}

func decodeJSONBytes[T any](raw json.RawMessage, target *T) error {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil
	}
	return json.Unmarshal(raw, target)
}

func normalizeTargetField(target *aiDiagnosisTargetRef, getter func(*aiDiagnosisTargetRef) string) string {
	if target == nil {
		return ""
	}
	return strings.TrimSpace(getter(target))
}

func extractTargetKind(raw json.RawMessage) string {
	var target *aiDiagnosisTargetRef
	if err := decodeJSONBytes(raw, &target); err != nil || target == nil {
		return ""
	}
	return strings.TrimSpace(target.Kind)
}

func extractTargetScope(raw json.RawMessage) string {
	var target *aiDiagnosisTargetRef
	if err := decodeJSONBytes(raw, &target); err != nil || target == nil {
		return ""
	}
	return strings.TrimSpace(target.Scope)
}

func extractTargetNamespace(raw json.RawMessage) string {
	var target *aiDiagnosisTargetRef
	if err := decodeJSONBytes(raw, &target); err != nil || target == nil {
		return ""
	}
	return strings.TrimSpace(target.Namespace)
}

func extractTargetName(raw json.RawMessage) string {
	var target *aiDiagnosisTargetRef
	if err := decodeJSONBytes(raw, &target); err != nil || target == nil {
		return ""
	}
	return strings.TrimSpace(target.Name)
}

func (h *handler) saveConversationMemory(
	ctx context.Context,
	prepared aiDiagnosisPreparedInput,
	conversation store.AIConversation,
	report aiDiagnosisReport,
) {
	if h.aiMemoryStore == nil {
		return
	}

	primaryTarget := findPrimaryTargetFromReport(report)
	tags := []string{report.RiskLevel}
	if prepared.Template != nil && prepared.Template.ID != "" {
		tags = append(tags, prepared.Template.ID)
	}

	_, _ = h.aiMemoryStore.Save(ctx, store.SaveAIMemoryInput{
		ClusterID:         prepared.Bundle.Status.ClusterID,
		ClusterName:       prepared.Bundle.Status.ClusterName,
		SourceType:        "conversation",
		SourceID:          conversation.ID,
		ResourceKind:      normalizeTargetField(primaryTarget, func(target *aiDiagnosisTargetRef) string { return target.Kind }),
		ResourceScope:     normalizeTargetField(primaryTarget, func(target *aiDiagnosisTargetRef) string { return target.Scope }),
		ResourceNamespace: normalizeTargetField(primaryTarget, func(target *aiDiagnosisTargetRef) string { return target.Namespace }),
		ResourceName:      normalizeTargetField(primaryTarget, func(target *aiDiagnosisTargetRef) string { return target.Name }),
		Title:             coalesceString(strings.TrimSpace(conversation.Title), report.Title),
		Summary:           coalesceString(strings.TrimSpace(conversation.Summary), report.Summary),
		Tags:              tags,
		Payload: map[string]any{
			"conversationId": conversation.ID,
			"templateId":     strings.TrimSpace(prepared.Payload.TemplateID),
			"riskLevel":      report.RiskLevel,
			"report":         report,
			"target":         primaryTarget,
		},
	})
}

func findPrimaryTargetFromReport(report aiDiagnosisReport) *aiDiagnosisTargetRef {
	for _, action := range report.Actions {
		if action.Target != nil {
			return action.Target
		}
	}
	for _, evidence := range report.Evidence {
		if evidence.Target != nil {
			return evidence.Target
		}
	}
	return nil
}

func (h *handler) collectAIDiagnosisIssueContext(clusterID string) []map[string]any {
	if h.aiIssueStore == nil {
		return nil
	}
	result, err := h.aiIssueStore.List(context.Background(), store.AIIssueFilter{
		ClusterID: strings.TrimSpace(clusterID),
		Page:      1,
		PageSize:  5,
	})
	if err != nil {
		return nil
	}

	items := make([]map[string]any, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, map[string]any{
			"title":         item.Title,
			"summary":       item.Summary,
			"riskLevel":     item.RiskLevel,
			"status":        item.Status,
			"occurrences":   item.OccurrenceCount,
			"lastDetectedAt": item.LastDetectedAt,
		})
	}
	return items
}

func (h *handler) collectAIDiagnosisMemoryContext(clusterID string) []map[string]any {
	if h.aiMemoryStore == nil {
		return nil
	}
	items, err := h.aiMemoryStore.List(context.Background(), store.AIMemoryFilter{
		ClusterID: strings.TrimSpace(clusterID),
		Limit:     5,
	})
	if err != nil {
		return nil
	}

	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		result = append(result, map[string]any{
			"title":         item.Title,
			"summary":       item.Summary,
			"sourceType":    item.SourceType,
			"feedbackLabel": item.FeedbackLabel,
			"resourceKind":  item.ResourceKind,
			"resourceName":  item.ResourceName,
			"updatedAt":     item.UpdatedAt,
		})
	}
	return result
}

func (h *handler) collectAIDiagnosisAuditContext(clusterID string) []map[string]any {
	if h.auditStore == nil {
		return nil
	}
	result, err := h.auditStore.List(context.Background(), store.AuditLogFilter{
		ClusterID: strings.TrimSpace(clusterID),
		Page:      1,
		PageSize:  5,
	})
	if err != nil {
		return nil
	}

	items := make([]map[string]any, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, map[string]any{
			"action":       item.Action,
			"resourceType": item.ResourceType,
			"resourceName": item.ResourceName,
			"status":       item.Status,
			"message":      item.Message,
			"createdAt":    item.CreatedAt,
		})
	}
	return items
}
