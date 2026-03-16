package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"k8s-agent-backend/internal/service"
)

type aiMetricsHistoryResponse struct {
	ClusterID   string                       `json:"clusterId,omitempty"`
	Range       string                       `json:"range"`
	Points      []service.ResourceUsagePoint `json:"points"`
	GeneratedAt string                       `json:"generatedAt"`
}

type aiAggregatedLogItem struct {
	Namespace string   `json:"namespace"`
	Name      string   `json:"name"`
	Status    string   `json:"status"`
	Node      string   `json:"node"`
	Snippets  []string `json:"snippets"`
}

type aiAggregatedLogsResponse struct {
	ClusterID   string                `json:"clusterId,omitempty"`
	GeneratedAt string                `json:"generatedAt"`
	Items       []aiAggregatedLogItem `json:"items"`
}

func (h *handler) aiMetricsHistory(w http.ResponseWriter, r *http.Request) error {
	clusterID := strings.TrimSpace(r.URL.Query().Get("clusterId"))
	rangeValue := strings.TrimSpace(r.URL.Query().Get("range"))
	if rangeValue == "" {
		rangeValue = string(service.ResourceUsageRangeToday)
	}

	payload, err := h.dashboardService.ResourceUsagePayload(r.Context(), clusterID, rangeValue)
	if err != nil {
		return err
	}

	var points []service.ResourceUsagePoint
	if err := json.Unmarshal(payload, &points); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, aiMetricsHistoryResponse{
		ClusterID:   clusterID,
		Range:       rangeValue,
		Points:      points,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	})
	return nil
}

func (h *handler) aiAggregatedLogs(w http.ResponseWriter, r *http.Request) error {
	clusterID := strings.TrimSpace(r.URL.Query().Get("clusterId"))
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	limit := parseAIInt(r.URL.Query().Get("limit"), 3)
	if limit <= 0 {
		limit = 3
	}
	if limit > 5 {
		limit = 5
	}

	payload, err := h.podsService.ListPayload(r.Context(), clusterID)
	if err != nil {
		return err
	}

	var pods []service.PodListItem
	if err := json.Unmarshal(payload, &pods); err != nil {
		return err
	}

	selected := selectAggregatedLogPods(pods, namespace, name, scope, limit)
	items := make([]aiAggregatedLogItem, 0, len(selected))
	for _, pod := range selected {
		logPayload, logErr := h.podsService.LogsPayload(r.Context(), clusterID, pod.Namespace, pod.Name)
		if logErr != nil {
			continue
		}

		var entries []service.PodLogEntry
		if err := json.Unmarshal(logPayload, &entries); err != nil {
			continue
		}

		snippets := make([]string, 0, 3)
		for index := len(entries) - 1; index >= 0 && len(snippets) < 3; index-- {
			message := strings.TrimSpace(entries[index].Message)
			if message == "" {
				continue
			}
			snippets = append(snippets, truncateText(message, 160))
		}
		if len(snippets) == 0 {
			continue
		}

		items = append(items, aiAggregatedLogItem{
			Namespace: pod.Namespace,
			Name:      pod.Name,
			Status:    pod.Status,
			Node:      pod.Node,
			Snippets:  snippets,
		})
	}

	writeJSON(w, http.StatusOK, aiAggregatedLogsResponse{
		ClusterID:   clusterID,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Items:       items,
	})
	return nil
}

func selectAggregatedLogPods(pods []service.PodListItem, namespace string, name string, scope string, limit int) []service.PodListItem {
	filtered := make([]service.PodListItem, 0, len(pods))
	for _, pod := range pods {
		if namespace != "" && pod.Namespace != namespace {
			continue
		}

		if name != "" {
			switch scope {
			case "pod":
				if pod.Name != name {
					continue
				}
			default:
				if pod.Name != name && !strings.HasPrefix(pod.Name, name+"-") && !strings.Contains(pod.Name, name) {
					continue
				}
			}
		}

		filtered = append(filtered, pod)
	}

	if len(filtered) == 0 {
		filtered = append(filtered, pods...)
	}

	sort.Slice(filtered, func(i, j int) bool {
		left := podLogPriority(filtered[i])
		right := podLogPriority(filtered[j])
		if left != right {
			return left > right
		}
		if filtered[i].Namespace == filtered[j].Namespace {
			return filtered[i].Name < filtered[j].Name
		}
		return filtered[i].Namespace < filtered[j].Namespace
	})

	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	return filtered
}

func podLogPriority(item service.PodListItem) int {
	status := strings.ToLower(strings.TrimSpace(item.Status))
	switch {
	case strings.Contains(status, "crash"), strings.Contains(status, "error"), strings.Contains(status, "backoff"), strings.Contains(status, "fail"):
		return 5
	case strings.Contains(status, "pending"), strings.Contains(status, "unknown"), strings.Contains(status, "init"):
		return 4
	case strings.Contains(status, "containercreating"):
		return 3
	default:
		return 1
	}
}

func parseAIInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	return parsed
}
