package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"k8s-agent-backend/internal/store"
)

type aiMultiClusterCounts struct {
	Clusters  int `json:"clusters"`
	Connected int `json:"connected"`
	Critical  int `json:"critical"`
	High      int `json:"high"`
	Medium    int `json:"medium"`
	Low       int `json:"low"`
	Healthy   int `json:"healthy"`
}

type aiMultiClusterItem struct {
	ClusterID        string             `json:"clusterId"`
	ClusterName      string             `json:"clusterName"`
	ConnectionStatus string             `json:"connectionStatus"`
	RiskLevel        string             `json:"riskLevel"`
	Summary          string             `json:"summary"`
	Counts           aiInspectionCounts `json:"counts"`
	TopIssueTitle    string             `json:"topIssueTitle,omitempty"`
	LastInspectionAt string             `json:"lastInspectionAt,omitempty"`
	LastConnectedAt  string             `json:"lastConnectedAt,omitempty"`
}

type aiMultiClusterSummaryResponse struct {
	GeneratedAt string                `json:"generatedAt"`
	Overview    string                `json:"overview"`
	Counts      aiMultiClusterCounts  `json:"counts"`
	Items       []aiMultiClusterItem  `json:"items"`
}

func (h *handler) aiMultiClusterSummary(w http.ResponseWriter, r *http.Request) error {
	if h.clusterStore == nil {
		return newHTTPError(http.StatusNotImplemented, "多集群汇总未启用")
	}

	clusters, err := h.clusterStore.List(r.Context())
	if err != nil {
		return err
	}

	items := make([]aiMultiClusterItem, 0, len(clusters))
	counts := aiMultiClusterCounts{}

	for _, cluster := range clusters {
		if !cluster.IsEnabled {
			continue
		}

		counts.Clusters++
		if cluster.LastConnectionStatus == store.ConnectionStatusConnected {
			counts.Connected++
		}

		item := aiMultiClusterItem{
			ClusterID:        cluster.ID,
			ClusterName:      cluster.Name,
			ConnectionStatus: cluster.LastConnectionStatus,
			RiskLevel:        "unknown",
			Summary:          "当前暂无巡检记录",
			Counts:           aiInspectionCounts{},
		}
		if cluster.LastConnectedAt != nil {
			item.LastConnectedAt = cluster.LastConnectedAt.UTC().Format(time.RFC3339)
		}

		if h.aiInspectionStore != nil {
			latestInspection, inspectionErr := h.aiInspectionStore.GetLatest(r.Context(), cluster.ID)
			if inspectionErr != nil {
				return inspectionErr
			}
			if latestInspection != nil {
				item.LastInspectionAt = latestInspection.CompletedAt.UTC().Format(time.RFC3339)
				item.RiskLevel = strings.TrimSpace(latestInspection.RiskLevel)
				if item.RiskLevel == "" {
					item.RiskLevel = "unknown"
				}
				if strings.TrimSpace(latestInspection.Summary) != "" {
					item.Summary = latestInspection.Summary
				}

				var payload aiInspectionResult
				if len(latestInspection.Payload) > 0 && string(latestInspection.Payload) != "{}" {
					if err := json.Unmarshal(latestInspection.Payload, &payload); err == nil {
						item.Counts = payload.Counts
						if len(payload.Issues) > 0 {
							item.TopIssueTitle = payload.Issues[0].Title
						}
					}
				}
			}
		}

		switch item.RiskLevel {
		case "critical":
			counts.Critical++
		case "high":
			counts.High++
		case "medium":
			counts.Medium++
		case "low":
			counts.Low++
			if item.Counts.Total == 0 {
				counts.Healthy++
			}
		default:
			counts.Healthy++
		}

		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		left := riskWeight(items[i].RiskLevel)
		right := riskWeight(items[j].RiskLevel)
		if left != right {
			return left > right
		}
		if items[i].Counts.Total != items[j].Counts.Total {
			return items[i].Counts.Total > items[j].Counts.Total
		}
		return strings.Compare(items[i].ClusterName, items[j].ClusterName) < 0
	})

	response := aiMultiClusterSummaryResponse{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Overview:    buildMultiClusterOverview(counts, items),
		Counts:      counts,
		Items:       items,
	}
	writeJSON(w, http.StatusOK, response)
	return nil
}

func riskWeight(level string) int {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "critical":
		return 5
	case "high":
		return 4
	case "medium":
		return 3
	case "low":
		return 2
	case "unknown":
		return 1
	default:
		return 0
	}
}

func buildMultiClusterOverview(counts aiMultiClusterCounts, items []aiMultiClusterItem) string {
	if counts.Clusters == 0 {
		return "当前没有已启用的集群可供汇总。"
	}
	if len(items) == 0 {
		return "当前暂无多集群巡检数据。"
	}

	top := items[0]
	if top.RiskLevel == "critical" || top.RiskLevel == "high" {
		return "当前应优先关注 " + top.ClusterName + "，该集群存在较高风险问题。"
	}
	if counts.Connected != counts.Clusters {
		return "当前存在集群连接异常，建议优先检查未连接或状态未知的集群。"
	}
	return "当前多集群整体风险可控，可优先跟进中高风险集群的待处理问题。"
}
