package api

import (
	"fmt"
	"net/http"
	"strings"

	"k8s-agent-backend/internal/store"
)

type aiFollowUpRecheckRequest struct {
	ClusterID      string                `json:"clusterId"`
	ActionTitle    string                `json:"actionTitle"`
	OperationLabel string                `json:"operationLabel"`
	Target         *aiDiagnosisTargetRef `json:"target"`
}

type aiFollowUpRecheckResponse struct {
	Outcome       string               `json:"outcome"`
	Summary       string               `json:"summary"`
	Inspection    *aiInspectionResult  `json:"inspection,omitempty"`
	RelatedIssues []aiInspectionIssue `json:"relatedIssues,omitempty"`
}

func (h *handler) runAIFollowUpRecheck(w http.ResponseWriter, r *http.Request) error {
	if h.aiInspectionRunner == nil {
		return newHTTPError(http.StatusServiceUnavailable, "AI 自动复检能力尚未初始化")
	}

	var payload aiFollowUpRecheckRequest
	if err := decodeJSON(r, &payload); err != nil {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	clusterID := strings.TrimSpace(payload.ClusterID)
	if clusterID == "" {
		clusterID = requestedClusterID(r)
	}

	resourceType, resourceName, namespace := resourceMetaFromTarget(payload.Target)
	if resourceType == "" {
		resourceType = "ai-issue"
	}
	if resourceName == "" {
		resourceName = coalesceString(strings.TrimSpace(payload.OperationLabel), strings.TrimSpace(payload.ActionTitle))
	}

	result, err := h.aiInspectionRunner.Run(r.Context(), clusterID, store.AIInspectionTriggerFollowUp)
	if err != nil {
		message := "操作已执行，但自动复检暂时无法完成，请稍后重试。"
		status := http.StatusBadGateway
		if translatedStatus, translatedMessage, ok := translateUpstreamError(err); ok {
			status = translatedStatus
			message = "操作已执行，但" + translatedMessage
		}

		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "ai.followup.recheck",
			ResourceType: resourceType,
			ResourceName: resourceName,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      message,
			Details: map[string]any{
				"actionTitle":    strings.TrimSpace(payload.ActionTitle),
				"operationLabel": strings.TrimSpace(payload.OperationLabel),
				"target":         payload.Target,
				"error":          err.Error(),
			},
		})

		return newHTTPError(status, message)
	}

	relatedIssues := matchInspectionIssues(result.Issues, payload.Target)
	outcome := "recovered"
	if len(relatedIssues) > 0 {
		outcome = "persistent"
	}
	if payload.Target == nil && len(result.Issues) > 0 {
		outcome = "attention"
	}

	summary := buildFollowUpSummary(payload, outcome, relatedIssues, result)
	auditStatus := store.AuditStatusSuccess
	if outcome == "persistent" {
		auditStatus = store.AuditStatusFailed
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "ai.followup.recheck",
		ResourceType: resourceType,
		ResourceName: resourceName,
		Namespace:    namespace,
		ClusterID:    result.ClusterID,
		ClusterName:  result.ClusterName,
		Status:       auditStatus,
		Message:      summary,
		Details: map[string]any{
			"outcome":        outcome,
			"inspectionId":   result.ID,
			"actionTitle":    strings.TrimSpace(payload.ActionTitle),
			"operationLabel": strings.TrimSpace(payload.OperationLabel),
			"target":         payload.Target,
			"relatedIssues":  relatedIssues,
		},
	})

	if h.aiMemoryStore != nil {
		feedbackLabel := "resolved"
		if outcome != "recovered" {
			feedbackLabel = "needs_improvement"
		}
		_, _ = h.aiMemoryStore.Save(r.Context(), store.SaveAIMemoryInput{
			ClusterID:         result.ClusterID,
			ClusterName:       result.ClusterName,
			SourceType:        "follow-up-recheck",
			SourceID:          result.ID,
			ResourceKind:      normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Kind }),
			ResourceScope:     normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Scope }),
			ResourceNamespace: normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Namespace }),
			ResourceName:      normalizeTargetField(payload.Target, func(target *aiDiagnosisTargetRef) string { return target.Name }),
			FeedbackLabel:     feedbackLabel,
			Title:             "AI 自动复检：" + coalesceString(resourceName, "目标资源"),
			Summary:           summary,
			Payload: map[string]any{
				"outcome":       outcome,
				"inspectionId":  result.ID,
				"target":        payload.Target,
				"relatedIssues": relatedIssues,
			},
			Tags: []string{"follow-up", outcome},
		})
	}

	writeJSON(w, http.StatusOK, aiFollowUpRecheckResponse{
		Outcome:       outcome,
		Summary:       summary,
		Inspection:    result,
		RelatedIssues: relatedIssues,
	})
	return nil
}

func matchInspectionIssues(items []aiInspectionIssue, target *aiDiagnosisTargetRef) []aiInspectionIssue {
	if target == nil {
		return nil
	}

	matched := make([]aiInspectionIssue, 0, len(items))
	for _, item := range items {
		if inspectionIssueMatchesTarget(item, target) {
			matched = append(matched, item)
		}
	}
	return matched
}

func inspectionIssueMatchesTarget(item aiInspectionIssue, target *aiDiagnosisTargetRef) bool {
	if target == nil {
		return false
	}
	if aiTargetsEqual(item.Target, target) {
		return true
	}
	for _, evidence := range item.Evidence {
		if aiTargetsEqual(evidence.Target, target) {
			return true
		}
	}
	for _, action := range item.Actions {
		if aiTargetsEqual(action.Target, target) {
			return true
		}
	}
	return false
}

func aiTargetsEqual(left *aiDiagnosisTargetRef, right *aiDiagnosisTargetRef) bool {
	if left == nil || right == nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(left.Kind), strings.TrimSpace(right.Kind)) &&
		strings.EqualFold(strings.TrimSpace(left.Scope), strings.TrimSpace(right.Scope)) &&
		strings.EqualFold(strings.TrimSpace(left.Namespace), strings.TrimSpace(right.Namespace)) &&
		strings.EqualFold(strings.TrimSpace(left.Name), strings.TrimSpace(right.Name))
}

func buildFollowUpSummary(payload aiFollowUpRecheckRequest, outcome string, relatedIssues []aiInspectionIssue, inspection *aiInspectionResult) string {
	targetLabel := mapTargetRefLabel(payload.Target)
	actionLabel := coalesceString(strings.TrimSpace(payload.OperationLabel), strings.TrimSpace(payload.ActionTitle))
	if actionLabel == "" {
		actionLabel = "这次操作"
	}

	switch outcome {
	case "persistent":
		return fmt.Sprintf("%s后已自动复检，但 %s 仍存在 %d 条相关风险，需要继续排查。", actionLabel, targetLabel, len(relatedIssues))
	case "attention":
		return actionLabel + "后已自动复检，当前集群仍有待关注问题，请查看问题中心确认是否已恢复。"
	default:
		if targetLabel == "" {
			return actionLabel + "后已自动复检，暂未发现需要继续处理的相关风险。"
		}
		return actionLabel + "后已自动复检，" + targetLabel + " 暂未再出现相关风险。"
	}
}

func mapTargetRefLabel(target *aiDiagnosisTargetRef) string {
	if target == nil {
		return ""
	}
	if strings.TrimSpace(target.Label) != "" {
		return strings.TrimSpace(target.Label)
	}
	if strings.TrimSpace(target.Namespace) != "" {
		return strings.TrimSpace(target.Namespace) + "/" + strings.TrimSpace(target.Name)
	}
	return strings.TrimSpace(target.Name)
}

func resourceMetaFromTarget(target *aiDiagnosisTargetRef) (string, string, string) {
	if target == nil {
		return "", "", ""
	}

	name := strings.TrimSpace(target.Name)
	namespace := strings.TrimSpace(target.Namespace)
	switch strings.ToLower(strings.TrimSpace(target.Kind)) {
	case "node":
		return "node", name, ""
	case "pod":
		return "pod", name, namespace
	case "workload":
		switch strings.ToLower(strings.TrimSpace(target.Scope)) {
		case "deployment", "deployments":
			return "deployments", name, namespace
		case "statefulset", "statefulsets":
			return "statefulsets", name, namespace
		case "daemonset", "daemonsets":
			return "daemonsets", name, namespace
		case "cronjob", "cronjobs":
			return "cronjobs", name, namespace
		default:
			return "deployments", name, namespace
		}
	default:
		return "", name, namespace
	}
}
