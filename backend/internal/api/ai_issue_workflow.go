package api

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
)

func (h *handler) acknowledgeAIIssue(w http.ResponseWriter, r *http.Request) error {
	return h.updateAIIssueWorkflowStatus(w, r, store.AIIssueStatusAcknowledged, "ai.issue.acknowledge", "问题已确认，等待后续处理")
}

func (h *handler) silenceAIIssue(w http.ResponseWriter, r *http.Request) error {
	return h.updateAIIssueWorkflowStatus(w, r, store.AIIssueStatusSilenced, "ai.issue.silence", "问题已进入静默观察")
}

func (h *handler) escalateAIIssue(w http.ResponseWriter, r *http.Request) error {
	return h.updateAIIssueWorkflowStatus(w, r, store.AIIssueStatusEscalated, "ai.issue.escalate", "问题已升级处理")
}

func (h *handler) updateAIIssueWorkflowStatus(w http.ResponseWriter, r *http.Request, status string, action string, successMessage string) error {
	if h.aiIssueStore == nil {
		return newHTTPError(http.StatusNotFound, "问题不存在")
	}

	var payload aiDiagnosisIssueStatusRequest
	if err := decodeJSON(r, &payload); err != nil && !errors.Is(err, io.EOF) {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	var silencedUntil *time.Time
	if status == store.AIIssueStatusSilenced {
		minutes := payload.SilenceMinutes
		if minutes <= 0 {
			minutes = 120
		}
		until := time.Now().UTC().Add(time.Duration(minutes) * time.Minute)
		silencedUntil = &until
	}

	escalationLevel := ""
	if status == store.AIIssueStatusEscalated {
		escalationLevel = strings.TrimSpace(payload.EscalationLevel)
		if escalationLevel == "" {
			escalationLevel = "P1"
		}
	}

	item, err := h.aiIssueStore.UpdateStatusDetail(r.Context(), store.UpdateAIIssueStatusInput{
		ID:              chi.URLParam(r, "id"),
		Status:          status,
		Note:            payload.Note,
		SilencedUntil:   silencedUntil,
		EscalationLevel: escalationLevel,
	})
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
			"id":              item.ID,
			"status":          item.Status,
			"note":            strings.TrimSpace(payload.Note),
			"silencedUntil":   item.SilencedUntil,
			"escalationLevel": item.EscalationLevel,
		},
	})

	writeJSON(w, http.StatusOK, toAIDiagnosisIssueResponse(*item))
	return nil
}
