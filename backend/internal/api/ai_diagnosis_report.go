package api

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"k8s-agent-backend/internal/service"
)

type aiDiagnosisTemplatePayload struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Prompt      string `json:"prompt"`
}

type aiDiagnosisReport struct {
	Title      string                `json:"title"`
	Summary    string                `json:"summary"`
	Conclusion string                `json:"conclusion"`
	RiskLevel  string                `json:"riskLevel"`
	Findings   []aiDiagnosisFinding  `json:"findings"`
	Actions    []aiDiagnosisAction   `json:"actions"`
	Evidence   []aiDiagnosisEvidence `json:"evidence"`
}

type aiDiagnosisFinding struct {
	Title       string   `json:"title"`
	Detail      string   `json:"detail"`
	Severity    string   `json:"severity"`
	EvidenceIDs []string `json:"evidenceIds,omitempty"`
}

type aiDiagnosisAction struct {
	Title       string                `json:"title"`
	Description string                `json:"description"`
	Priority    string                `json:"priority"`
	ActionType  string                `json:"actionType"`
	CommandHint string                `json:"commandHint,omitempty"`
	Risk        string                `json:"risk,omitempty"`
	Target      *aiDiagnosisTargetRef `json:"target,omitempty"`
}

type aiDiagnosisEvidence struct {
	ID        string                `json:"id"`
	Type      string                `json:"type"`
	Severity  string                `json:"severity"`
	Title     string                `json:"title"`
	Summary   string                `json:"summary"`
	Timestamp string                `json:"timestamp,omitempty"`
	Target    *aiDiagnosisTargetRef `json:"target,omitempty"`
	Snippets  []string              `json:"snippets,omitempty"`
}

type aiDiagnosisTargetRef struct {
	Kind      string `json:"kind"`
	Scope     string `json:"scope,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	Route     string `json:"route,omitempty"`
	Label     string `json:"label"`
}

type scoredAIDiagnosisEvidence struct {
	Evidence aiDiagnosisEvidence
	Score    int
}

func aiDiagnosisTemplates() []aiDiagnosisTemplatePayload {
	return []aiDiagnosisTemplatePayload{
		{
			ID:          "pod-pending",
			Title:       "Pod Pending",
			Description: "分析 Pod 长时间 Pending、调度失败、资源不足或存储依赖未满足的问题。",
			Category:    "调度与资源",
			Prompt:      "请重点分析当前集群中的 Pending Pod，说明调度、资源、亲和性、污点和存储相关的可能原因，并给出优先处理建议。",
		},
		{
			ID:          "pvc-pending",
			Title:       "PVC Pending",
			Description: "分析卷申请失败、Provisioning 异常、StorageClass 配置和绑定问题。",
			Category:    "存储",
			Prompt:      "请重点排查当前集群中的 PVC Pending 或卷创建失败问题，结合事件、Pod 状态和工作负载影响给出诊断结论。",
		},
		{
			ID:          "crashloopbackoff",
			Title:       "CrashLoopBackOff",
			Description: "分析容器重复重启、启动命令、探针、配置和依赖异常。",
			Category:    "稳定性",
			Prompt:      "请重点分析当前集群中的 CrashLoopBackOff 或重复重启 Pod，结合日志、事件和工作负载状态给出优先建议。",
		},
		{
			ID:          "node-pressure",
			Title:       "Node Pressure",
			Description: "分析节点 CPU/内存压力、不可调度、异常事件和受影响工作负载。",
			Category:    "节点健康",
			Prompt:      "请重点分析当前集群中的高负载节点、不可调度节点或节点压力问题，说明影响范围和处理优先级。",
		},
	}
}

func aiDiagnosisTemplateByID(id string) (aiDiagnosisTemplatePayload, bool) {
	for _, template := range aiDiagnosisTemplates() {
		if template.ID == strings.TrimSpace(id) {
			return template, true
		}
	}
	return aiDiagnosisTemplatePayload{}, false
}

func (h *handler) buildAIDiagnosisReport(
	ctx context.Context,
	bundle aiDiagnosisBundle,
	message string,
	template *aiDiagnosisTemplatePayload,
) aiDiagnosisReport {
	evidence := h.collectAIDiagnosisEvidence(ctx, bundle, message, template)
	if len(evidence) == 0 {
		evidence = []aiDiagnosisEvidence{
			{
				ID:       "e-overview",
				Type:     "status",
				Severity: "low",
				Title:    "当前集群概览",
				Summary: fmt.Sprintf(
					"集群共有 %d 个节点、%d 个 Pods、%d 个工作负载，当前未发现足够多的高优先级异常证据。",
					bundle.Status.Overview.TotalNodes,
					bundle.Status.Overview.TotalPods,
					bundle.Status.Overview.TotalWorkloads,
				),
				Timestamp: bundle.Status.GeneratedAt.Format(time.RFC3339),
			},
		}
	}

	riskLevel := buildAIDiagnosisRiskLevel(bundle.Status, evidence)
	return aiDiagnosisReport{
		Title:      buildAIDiagnosisReportTitle(message, template),
		Summary:    buildAIDiagnosisSummary(bundle.Status, evidence, template),
		Conclusion: buildAIDiagnosisConclusion(bundle.Status, evidence, riskLevel),
		RiskLevel:  riskLevel,
		Findings:   buildAIDiagnosisFindings(evidence),
		Actions:    buildAIDiagnosisActions(evidence, template),
		Evidence:   evidence,
	}
}

func (h *handler) collectAIDiagnosisEvidence(
	ctx context.Context,
	bundle aiDiagnosisBundle,
	message string,
	template *aiDiagnosisTemplatePayload,
) []aiDiagnosisEvidence {
	messageLower := strings.ToLower(strings.TrimSpace(message))
	candidates := make([]scoredAIDiagnosisEvidence, 0, 16)

	focusEvents := selectDiagnosisEvents(bundle, messageLower, template)
	for _, event := range focusEvents {
		target := targetRefFromDashboardEvent(event.InvolvedObject)
		score := eventSeverity(event)
		if target != nil {
			score++
		}
		candidates = append(candidates, scoredAIDiagnosisEvidence{
			Score: score,
			Evidence: aiDiagnosisEvidence{
				ID:        "event-" + strings.TrimSpace(event.ID),
				Type:      "event",
				Severity:  severityLabelFromScore(score),
				Title:     strings.TrimSpace(event.Reason),
				Summary:   truncateText(strings.TrimSpace(event.Message), 120),
				Timestamp: event.Timestamp,
				Target:    target,
				Snippets:  compactSnippets([]string{event.Message}, 2),
			},
		})
	}

	focusPods := selectDiagnosisPods(bundle, messageLower, template)
	for _, pod := range focusPods {
		target := newPodTargetRef(pod.Namespace, pod.Name)
		severity := podSeverity(pod.Status)
		candidates = append(candidates,
			scoredAIDiagnosisEvidence{
				Score: maxInt(severity, 2),
				Evidence: aiDiagnosisEvidence{
					ID:        "pod-status-" + pod.Namespace + "-" + pod.Name,
					Type:      "status",
					Severity:  severityLabelFromScore(severity),
					Title:     fmt.Sprintf("Pod %s 状态异常", pod.Name),
					Summary:   fmt.Sprintf("命名空间 %s 中的 Pod %s 当前状态为 %s，所在节点 %s。", pod.Namespace, pod.Name, pod.Status, coalesceString(pod.Node, "--")),
					Timestamp: bundle.Status.GeneratedAt.Format(time.RFC3339),
					Target:    target,
				},
			},
		)

		var metrics service.PodMetrics
		metricsPayload, err := h.podsService.MetricsPayload(ctx, bundle.Status.ClusterID, pod.Namespace, pod.Name)
		if err == nil && json.Unmarshal(metricsPayload, &metrics) == nil {
			score := 1
			if metrics.CPUUsage >= 80 || metrics.MemoryUsage >= 80 {
				score = 3
			} else if metrics.CPUUsage >= 60 || metrics.MemoryUsage >= 60 {
				score = 2
			}
			candidates = append(candidates, scoredAIDiagnosisEvidence{
				Score: score,
				Evidence: aiDiagnosisEvidence{
					ID:        "pod-metrics-" + pod.Namespace + "-" + pod.Name,
					Type:      "metric",
					Severity:  severityLabelFromScore(score),
					Title:     fmt.Sprintf("Pod %s 资源指标", pod.Name),
					Summary:   fmt.Sprintf("CPU %dm，内存 %dMi。", metrics.CPUUsage, metrics.MemoryUsage),
					Timestamp: metrics.Timestamp.Format(time.RFC3339),
					Target:    target,
				},
			})
		}

		var logs []service.PodLogEntry
		logsPayload, err := h.podsService.LogsPayload(ctx, bundle.Status.ClusterID, pod.Namespace, pod.Name)
		if err == nil && json.Unmarshal(logsPayload, &logs) == nil && len(logs) > 0 {
			logSnippets := make([]string, 0, len(logs))
			for index := len(logs) - 1; index >= 0 && len(logSnippets) < 3; index-- {
				logSnippets = append(logSnippets, truncateText(strings.TrimSpace(logs[index].Message), 140))
			}
			candidates = append(candidates, scoredAIDiagnosisEvidence{
				Score: maxInt(severity, 2),
				Evidence: aiDiagnosisEvidence{
					ID:        "pod-logs-" + pod.Namespace + "-" + pod.Name,
					Type:      "log",
					Severity:  severityLabelFromScore(maxInt(severity, 2)),
					Title:     fmt.Sprintf("Pod %s 最近日志", pod.Name),
					Summary:   "已抽取最近 3 条日志用于辅助判断。",
					Timestamp: bundle.Status.GeneratedAt.Format(time.RFC3339),
					Target:    target,
					Snippets:  logSnippets,
				},
			})
		}
	}

	focusNodes := selectDiagnosisNodes(bundle, messageLower, template)
	for _, node := range focusNodes {
		target := newNodeTargetRef(node.Name)
		severity := nodeSeverity(aiDiagnosisNodeSummary{
			Name:        node.Name,
			Status:      node.Status,
			Schedulable: node.Schedulable,
			CPUUsage:    node.CPUUsage,
			MemoryUsage: node.MemoryUsage,
			Pods:        node.Pods,
			IP:          node.IP,
		})
		candidates = append(candidates, scoredAIDiagnosisEvidence{
			Score: maxInt(severity, 2),
			Evidence: aiDiagnosisEvidence{
				ID:        "node-status-" + node.Name,
				Type:      "status",
				Severity:  severityLabelFromScore(severity),
				Title:     fmt.Sprintf("节点 %s 状态", node.Name),
				Summary:   fmt.Sprintf("状态 %s，CPU %d%%，内存 %d%%，当前承载 %d 个 Pods。", node.Status, node.CPUUsage, node.MemoryUsage, node.Pods),
				Timestamp: bundle.Status.GeneratedAt.Format(time.RFC3339),
				Target:    target,
			},
		})

		var metrics service.NodeMetrics
		metricsPayload, err := h.nodesService.MetricsPayload(ctx, bundle.Status.ClusterID, node.Name)
		if err == nil && json.Unmarshal(metricsPayload, &metrics) == nil {
			score := 1
			if metrics.CPUUsage >= 85 || metrics.MemoryUsage >= 85 {
				score = 3
			} else if metrics.CPUUsage >= 65 || metrics.MemoryUsage >= 65 {
				score = 2
			}
			candidates = append(candidates, scoredAIDiagnosisEvidence{
				Score: score,
				Evidence: aiDiagnosisEvidence{
					ID:        "node-metrics-" + node.Name,
					Type:      "metric",
					Severity:  severityLabelFromScore(score),
					Title:     fmt.Sprintf("节点 %s 资源压力", node.Name),
					Summary:   fmt.Sprintf("CPU %d%%，内存 %d%%。", metrics.CPUUsage, metrics.MemoryUsage),
					Timestamp: metrics.Timestamp.Format(time.RFC3339),
					Target:    target,
				},
			})
		}
	}

	focusWorkloads := selectDiagnosisWorkloads(bundle, messageLower, template)
	for _, workload := range focusWorkloads {
		target := newWorkloadTargetRef(workload.Scope, workload.Namespace, workload.Name)
		severity := workloadSeverity(workload)
		summary := fmt.Sprintf(
			"工作负载 %s/%s 当前 Ready %d/%d，Available %d。",
			workload.Namespace,
			workload.Name,
			workload.Ready,
			workload.Desired,
			workload.Available,
		)
		if workload.Paused {
			summary += " 当前处于暂停状态。"
		}

		candidates = append(candidates, scoredAIDiagnosisEvidence{
			Score: severity,
			Evidence: aiDiagnosisEvidence{
				ID:        "workload-" + singularWorkloadScope(workload.Scope) + "-" + workload.Namespace + "-" + workload.Name,
				Type:      "status",
				Severity:  severityLabelFromScore(severity),
				Title:     fmt.Sprintf("工作负载 %s 状态异常", workload.Name),
				Summary:   summary,
				Timestamp: bundle.Status.GeneratedAt.Format(time.RFC3339),
				Target:    target,
			},
		})
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Score != candidates[j].Score {
			return candidates[i].Score > candidates[j].Score
		}
		return candidates[i].Evidence.ID < candidates[j].Evidence.ID
	})

	deduped := make([]aiDiagnosisEvidence, 0, 6)
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		key := candidate.Evidence.ID
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, candidate.Evidence)
		if len(deduped) >= 6 {
			break
		}
	}

	return deduped
}

func selectDiagnosisEvents(
	bundle aiDiagnosisBundle,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) []service.DashboardEvent {
	items := make([]service.DashboardEvent, 0, len(bundle.RecentEvents))
	for _, event := range bundle.RecentEvents {
		if eventMatchesDiagnosis(event, messageLower, template) {
			items = append(items, event)
		}
	}
	if len(items) == 0 {
		items = append(items, bundle.RecentEvents...)
	}

	sort.SliceStable(items, func(i, j int) bool {
		leftSeverity := eventSeverity(items[i])
		rightSeverity := eventSeverity(items[j])
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		return items[i].Timestamp > items[j].Timestamp
	})

	if len(items) > 3 {
		items = items[:3]
	}
	return items
}

func selectDiagnosisPods(
	bundle aiDiagnosisBundle,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) []service.PodListItem {
	pods := make([]service.PodListItem, 0, len(bundle.Pods))
	for _, pod := range bundle.Pods {
		if podMatchesDiagnosis(pod, messageLower, template) {
			pods = append(pods, pod)
		}
	}
	if len(pods) == 0 {
		for _, pod := range bundle.Pods {
			if podSeverity(pod.Status) > 0 {
				pods = append(pods, pod)
			}
		}
	}

	sort.SliceStable(pods, func(i, j int) bool {
		leftSeverity := podSeverity(pods[i].Status)
		rightSeverity := podSeverity(pods[j].Status)
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		if pods[i].Namespace != pods[j].Namespace {
			return pods[i].Namespace < pods[j].Namespace
		}
		return pods[i].Name < pods[j].Name
	})

	if len(pods) > 2 {
		pods = pods[:2]
	}
	return pods
}

func selectDiagnosisNodes(
	bundle aiDiagnosisBundle,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) []service.NodeListItem {
	nodes := make([]service.NodeListItem, 0, len(bundle.Nodes))
	for _, node := range bundle.Nodes {
		if nodeMatchesDiagnosis(node, messageLower, template) {
			nodes = append(nodes, node)
		}
	}
	if len(nodes) == 0 {
		for _, node := range bundle.Nodes {
			if nodeSeverity(aiDiagnosisNodeSummary{
				Name:        node.Name,
				Status:      node.Status,
				Schedulable: node.Schedulable,
				CPUUsage:    node.CPUUsage,
				MemoryUsage: node.MemoryUsage,
				Pods:        node.Pods,
				IP:          node.IP,
			}) > 0 {
				nodes = append(nodes, node)
			}
		}
	}

	sort.SliceStable(nodes, func(i, j int) bool {
		leftSeverity := nodeSeverity(aiDiagnosisNodeSummary{
			Name:        nodes[i].Name,
			Status:      nodes[i].Status,
			Schedulable: nodes[i].Schedulable,
			CPUUsage:    nodes[i].CPUUsage,
			MemoryUsage: nodes[i].MemoryUsage,
			Pods:        nodes[i].Pods,
			IP:          nodes[i].IP,
		})
		rightSeverity := nodeSeverity(aiDiagnosisNodeSummary{
			Name:        nodes[j].Name,
			Status:      nodes[j].Status,
			Schedulable: nodes[j].Schedulable,
			CPUUsage:    nodes[j].CPUUsage,
			MemoryUsage: nodes[j].MemoryUsage,
			Pods:        nodes[j].Pods,
			IP:          nodes[j].IP,
		})
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		return nodes[i].Name < nodes[j].Name
	})

	if len(nodes) > 2 {
		nodes = nodes[:2]
	}
	return nodes
}

func selectDiagnosisWorkloads(
	bundle aiDiagnosisBundle,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) []aiDiagnosisWorkloadHint {
	candidates := make([]aiDiagnosisWorkloadHint, 0)
	allWorkloads := make([]aiDiagnosisWorkloadHint, 0, len(bundle.Deployments)+len(bundle.StatefulSets)+len(bundle.DaemonSets)+len(bundle.CronJobs))
	allWorkloads = append(allWorkloads, buildAIDiagnosisWorkloadAlerts(bundle.Deployments, "deployments")...)
	allWorkloads = append(allWorkloads, buildAIDiagnosisWorkloadAlerts(bundle.StatefulSets, "statefulsets")...)
	allWorkloads = append(allWorkloads, buildAIDiagnosisWorkloadAlerts(bundle.DaemonSets, "daemonsets")...)
	allWorkloads = append(allWorkloads, buildAIDiagnosisWorkloadAlerts(bundle.CronJobs, "cronjobs")...)

	for _, workload := range allWorkloads {
		if workloadMatchesDiagnosis(workload, messageLower, template) {
			candidates = append(candidates, workload)
		}
	}
	if len(candidates) == 0 {
		candidates = append(candidates, allWorkloads...)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		leftSeverity := workloadSeverity(candidates[i])
		rightSeverity := workloadSeverity(candidates[j])
		if leftSeverity != rightSeverity {
			return leftSeverity > rightSeverity
		}
		if candidates[i].Namespace != candidates[j].Namespace {
			return candidates[i].Namespace < candidates[j].Namespace
		}
		return candidates[i].Name < candidates[j].Name
	})

	if len(candidates) > 2 {
		candidates = candidates[:2]
	}
	return candidates
}

func buildAIDiagnosisFindings(evidence []aiDiagnosisEvidence) []aiDiagnosisFinding {
	findings := make([]aiDiagnosisFinding, 0, len(evidence))
	for _, item := range evidence {
		findings = append(findings, aiDiagnosisFinding{
			Title:       item.Title,
			Detail:      item.Summary,
			Severity:    item.Severity,
			EvidenceIDs: []string{item.ID},
		})
		if len(findings) >= 4 {
			break
		}
	}
	return findings
}

func buildAIDiagnosisActions(
	evidence []aiDiagnosisEvidence,
	template *aiDiagnosisTemplatePayload,
) []aiDiagnosisAction {
	actions := make([]aiDiagnosisAction, 0, len(evidence)+1)
	seen := make(map[string]struct{})

	for _, item := range evidence {
		if item.Target == nil {
			continue
		}

		key := item.Target.Route + ":" + item.Type
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		action := aiDiagnosisAction{
			Priority:   priorityFromSeverity(item.Severity),
			ActionType: "inspect",
			Target:     item.Target,
		}

		switch item.Target.Kind {
		case "pod":
			action.Title = "查看 Pod 详情"
			action.Description = "优先检查该 Pod 的事件、日志和资源使用情况，确认是否存在调度、探针或配置异常。"
			action.CommandHint = fmt.Sprintf("kubectl -n %s describe pod %s", item.Target.Namespace, item.Target.Name)
			action.Risk = "若直接删除或重启 Pod，需先确认其是否由上层工作负载控制。"
		case "node":
			action.Title = "查看节点详情"
			action.Description = "确认该节点的调度状态、资源压力和受影响 Pods，必要时评估是否需要维护或扩容。"
			action.CommandHint = fmt.Sprintf("kubectl describe node %s", item.Target.Name)
			action.Risk = "节点操作可能影响该节点上的所有工作负载，应先评估影响范围。"
		case "workload":
			action.Title = "查看工作负载详情"
			action.Description = "优先检查副本、滚动发布状态、关联 Pods 与事件，确认 Ready/Desired 不一致的原因。"
			action.CommandHint = buildWorkloadInspectCommand(item.Target)
			action.Risk = "重启、扩缩容或删除工作负载前，需要确认业务窗口和副本冗余。"
		default:
			continue
		}

		actions = append(actions, action)
		if len(actions) >= 4 {
			break
		}
	}

	if template != nil && len(actions) == 0 {
		actions = append(actions, aiDiagnosisAction{
			Title:       "按模板继续排查",
			Description: fmt.Sprintf("当前模板为 %s，建议结合事件、日志和资源详情继续逐项确认。", template.Title),
			Priority:    "p2",
			ActionType:  "follow-up",
		})
	}

	return actions
}

func buildAIDiagnosisRiskLevel(
	status aiDiagnosisClusterStatus,
	evidence []aiDiagnosisEvidence,
) string {
	maxSeverity := 0
	for _, item := range evidence {
		maxSeverity = maxInt(maxSeverity, severityScore(item.Severity))
	}

	switch {
	case status.Overview.OfflineNodes > 0 || maxSeverity >= 4:
		return "critical"
	case len(status.ProblemPods) > 0 || len(status.WorkloadAlerts) > 0 || maxSeverity >= 3:
		return "high"
	case status.Overview.CPUUsage >= 70 || status.Overview.MemoryUsage >= 70 || maxSeverity >= 2:
		return "medium"
	default:
		return "low"
	}
}

func buildAIDiagnosisReportTitle(message string, template *aiDiagnosisTemplatePayload) string {
	if template != nil {
		return template.Title + " 诊断"
	}
	return truncateText(strings.TrimSpace(message), 24)
}

func buildAIDiagnosisSummary(
	status aiDiagnosisClusterStatus,
	evidence []aiDiagnosisEvidence,
	template *aiDiagnosisTemplatePayload,
) string {
	parts := make([]string, 0, 3)
	if status.Overview.OfflineNodes > 0 {
		parts = append(parts, fmt.Sprintf("%d 个节点异常", status.Overview.OfflineNodes))
	}
	if len(status.ProblemPods) > 0 {
		parts = append(parts, fmt.Sprintf("%d 个异常 Pod", len(status.ProblemPods)))
	}
	if len(status.WorkloadAlerts) > 0 {
		parts = append(parts, fmt.Sprintf("%d 个异常工作负载", len(status.WorkloadAlerts)))
	}

	prefix := "当前集群整体状态基本稳定"
	if len(parts) > 0 {
		prefix = "当前集群存在 " + strings.Join(parts, "、")
	}
	if template != nil {
		return fmt.Sprintf("%s，本次已按 %s 模板补充证据链并生成诊断建议。", prefix, template.Title)
	}
	if len(evidence) > 0 {
		return fmt.Sprintf("%s，本次诊断已关联 %d 条关键证据。", prefix, len(evidence))
	}
	return prefix + "。"
}

func buildAIDiagnosisConclusion(
	status aiDiagnosisClusterStatus,
	evidence []aiDiagnosisEvidence,
	riskLevel string,
) string {
	if len(evidence) == 0 {
		return "当前没有足够多的异常证据，建议继续观察并结合具体对象发起诊断。"
	}

	firstEvidence := evidence[0]
	switch riskLevel {
	case "critical":
		return fmt.Sprintf("当前存在需要立即处理的高风险异常，首要关注：%s。", firstEvidence.Title)
	case "high":
		return fmt.Sprintf("当前存在明确的稳定性风险，建议优先围绕“%s”展开处置。", firstEvidence.Title)
	case "medium":
		return fmt.Sprintf("当前存在中等风险告警，建议优先确认“%s”是否持续扩大。", firstEvidence.Title)
	default:
		if status.Source == "snapshot" {
			return "当前诊断基于快照数据，建议刷新上下文后再确认一次。"
		}
		return "当前未发现明显的高风险异常，可结合关键证据继续做预防性排查。"
	}
}

func eventMatchesDiagnosis(
	event service.DashboardEvent,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) bool {
	combined := strings.ToLower(strings.TrimSpace(event.Reason + " " + event.Message + " " + event.InvolvedObject.Kind + " " + event.InvolvedObject.Name))
	if messageLower != "" && strings.Contains(combined, messageLower) {
		return true
	}
	if messageLower != "" && strings.Contains(messageLower, strings.ToLower(event.InvolvedObject.Name)) && event.InvolvedObject.Name != "" {
		return true
	}
	if template == nil {
		return eventSeverity(event) >= 2
	}

	switch template.ID {
	case "pod-pending":
		return strings.Contains(combined, "schedule") || strings.Contains(combined, "pending")
	case "pvc-pending":
		return strings.Contains(combined, "persistentvolumeclaim") || strings.Contains(combined, "provision") || strings.Contains(combined, "volume")
	case "crashloopbackoff":
		return strings.Contains(combined, "backoff") || strings.Contains(combined, "probe") || strings.Contains(combined, "crash")
	case "node-pressure":
		return strings.Contains(combined, "pressure") || strings.Contains(combined, "node") || strings.Contains(combined, "evict")
	default:
		return eventSeverity(event) >= 2
	}
}

func podMatchesDiagnosis(
	pod service.PodListItem,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) bool {
	status := strings.ToLower(strings.TrimSpace(pod.Status))
	if messageLower != "" && (strings.Contains(messageLower, strings.ToLower(pod.Name)) || strings.Contains(messageLower, strings.ToLower(pod.Namespace))) {
		return true
	}
	if template == nil {
		return podSeverity(status) > 0
	}

	switch template.ID {
	case "pod-pending", "pvc-pending":
		return strings.Contains(status, "pending")
	case "crashloopbackoff":
		return strings.Contains(status, "crashloopbackoff") || strings.Contains(status, "failed") || strings.Contains(status, "imagepull")
	case "node-pressure":
		return podSeverity(status) > 0
	default:
		return podSeverity(status) > 0
	}
}

func nodeMatchesDiagnosis(
	node service.NodeListItem,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) bool {
	if messageLower != "" && strings.Contains(messageLower, strings.ToLower(node.Name)) {
		return true
	}
	if template == nil {
		return nodeSeverity(aiDiagnosisNodeSummary{
			Name:        node.Name,
			Status:      node.Status,
			Schedulable: node.Schedulable,
			CPUUsage:    node.CPUUsage,
			MemoryUsage: node.MemoryUsage,
			Pods:        node.Pods,
			IP:          node.IP,
		}) > 0
	}
	if template.ID == "node-pressure" {
		return node.CPUUsage >= 70 || node.MemoryUsage >= 70 || !node.Schedulable || strings.EqualFold(node.Status, "offline")
	}
	return nodeSeverity(aiDiagnosisNodeSummary{
		Name:        node.Name,
		Status:      node.Status,
		Schedulable: node.Schedulable,
		CPUUsage:    node.CPUUsage,
		MemoryUsage: node.MemoryUsage,
		Pods:        node.Pods,
		IP:          node.IP,
	}) > 0
}

func workloadMatchesDiagnosis(
	workload aiDiagnosisWorkloadHint,
	messageLower string,
	template *aiDiagnosisTemplatePayload,
) bool {
	if messageLower != "" && (strings.Contains(messageLower, strings.ToLower(workload.Name)) || strings.Contains(messageLower, strings.ToLower(workload.Namespace))) {
		return true
	}
	if template == nil {
		return workloadSeverity(workload) > 1
	}
	switch template.ID {
	case "pod-pending", "pvc-pending", "crashloopbackoff":
		return workloadSeverity(workload) > 1
	case "node-pressure":
		return workloadSeverity(workload) > 2
	default:
		return workloadSeverity(workload) > 1
	}
}

func eventSeverity(event service.DashboardEvent) int {
	typeLower := strings.ToLower(strings.TrimSpace(event.Type))
	reasonLower := strings.ToLower(strings.TrimSpace(event.Reason))
	messageLower := strings.ToLower(strings.TrimSpace(event.Message))
	switch {
	case typeLower == "warning" && (strings.Contains(reasonLower, "failed") || strings.Contains(messageLower, "failed")):
		return 4
	case typeLower == "warning":
		return 3
	case strings.Contains(reasonLower, "backoff") || strings.Contains(reasonLower, "evict"):
		return 3
	default:
		return 1
	}
}

func severityLabelFromScore(score int) string {
	switch {
	case score >= 4:
		return "critical"
	case score >= 3:
		return "high"
	case score >= 2:
		return "medium"
	default:
		return "low"
	}
}

func severityScore(severity string) int {
	switch strings.ToLower(strings.TrimSpace(severity)) {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func priorityFromSeverity(severity string) string {
	switch strings.ToLower(strings.TrimSpace(severity)) {
	case "critical", "high":
		return "p1"
	case "medium":
		return "p2"
	default:
		return "p3"
	}
}

func targetRefFromDashboardEvent(target service.DashboardEventTarget) *aiDiagnosisTargetRef {
	switch strings.ToLower(strings.TrimSpace(target.Kind)) {
	case "pod":
		if target.Namespace == "" || target.Name == "" {
			return nil
		}
		return newPodTargetRef(target.Namespace, target.Name)
	case "node":
		if target.Name == "" {
			return nil
		}
		return newNodeTargetRef(target.Name)
	case "deployment":
		if target.Namespace == "" || target.Name == "" {
			return nil
		}
		return newWorkloadTargetRef("deployments", target.Namespace, target.Name)
	case "statefulset":
		if target.Namespace == "" || target.Name == "" {
			return nil
		}
		return newWorkloadTargetRef("statefulsets", target.Namespace, target.Name)
	case "daemonset":
		if target.Namespace == "" || target.Name == "" {
			return nil
		}
		return newWorkloadTargetRef("daemonsets", target.Namespace, target.Name)
	case "cronjob":
		if target.Namespace == "" || target.Name == "" {
			return nil
		}
		return newWorkloadTargetRef("cronjobs", target.Namespace, target.Name)
	default:
		return nil
	}
}

func newNodeTargetRef(name string) *aiDiagnosisTargetRef {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	return &aiDiagnosisTargetRef{
		Kind:  "node",
		Name:  name,
		Route: "/nodes?name=" + name,
		Label: name,
	}
}

func newPodTargetRef(namespace string, name string) *aiDiagnosisTargetRef {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	if namespace == "" || name == "" {
		return nil
	}
	return &aiDiagnosisTargetRef{
		Kind:      "pod",
		Namespace: namespace,
		Name:      name,
		Route:     fmt.Sprintf("/pods?namespace=%s&name=%s", namespace, name),
		Label:     namespace + "/" + name,
	}
}

func newWorkloadTargetRef(scope string, namespace string, name string) *aiDiagnosisTargetRef {
	scope = strings.TrimSpace(scope)
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	if scope == "" || namespace == "" || name == "" {
		return nil
	}
	workloadType := singularWorkloadScope(scope)
	return &aiDiagnosisTargetRef{
		Kind:      "workload",
		Scope:     workloadType,
		Namespace: namespace,
		Name:      name,
		Route:     fmt.Sprintf("/workloads?type=%s&namespace=%s&name=%s", workloadType, namespace, name),
		Label:     namespace + "/" + name,
	}
}

func singularWorkloadScope(scope string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "deployments":
		return "deployment"
	case "statefulsets":
		return "statefulset"
	case "daemonsets":
		return "daemonset"
	case "cronjobs":
		return "cronjob"
	default:
		return strings.TrimSpace(scope)
	}
}

func buildWorkloadInspectCommand(target *aiDiagnosisTargetRef) string {
	if target == nil || target.Kind != "workload" {
		return ""
	}

	switch target.Scope {
	case "deployment":
		return fmt.Sprintf("kubectl -n %s rollout status deployment/%s", target.Namespace, target.Name)
	case "statefulset":
		return fmt.Sprintf("kubectl -n %s describe statefulset %s", target.Namespace, target.Name)
	case "daemonset":
		return fmt.Sprintf("kubectl -n %s describe daemonset %s", target.Namespace, target.Name)
	case "cronjob":
		return fmt.Sprintf("kubectl -n %s describe cronjob %s", target.Namespace, target.Name)
	default:
		return ""
	}
}

func compactSnippets(lines []string, limit int) []string {
	if limit <= 0 {
		limit = 3
	}
	items := make([]string, 0, limit)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		items = append(items, line)
		if len(items) >= limit {
			break
		}
	}
	return items
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
