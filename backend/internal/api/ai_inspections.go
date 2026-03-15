package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/service"
	"k8s-agent-backend/internal/store"
)

type AIInspectionRunner struct {
	inspectionStore  *store.AIInspectionStore
	issueStore       *store.AIIssueStore
	clusterStore     *store.ClusterStore
	auditStore       *store.AuditStore
	dashboardService *service.DashboardService
	nodesService     *service.NodesService
	podsService      *service.PodsService
	workloadsService *service.WorkloadsService
	k8sManager       *k8s.Manager
}

type aiInspectionRunRequest struct {
	ClusterID string `json:"clusterId"`
}

type aiInspectionCounts struct {
	Total    int `json:"total"`
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
}

type aiInspectionIssue struct {
	ID            string                `json:"id"`
	Category      string                `json:"category"`
	Title         string                `json:"title"`
	Summary       string                `json:"summary"`
	RiskLevel     string                `json:"riskLevel"`
	Score         int                   `json:"score"`
	AffectedCount int                   `json:"affectedCount"`
	Target        *aiDiagnosisTargetRef `json:"target,omitempty"`
	Evidence      []aiDiagnosisEvidence `json:"evidence,omitempty"`
	Actions       []aiDiagnosisAction   `json:"actions,omitempty"`
}

type aiInspectionResult struct {
	ID            string              `json:"id,omitempty"`
	ClusterID     string              `json:"clusterId,omitempty"`
	ClusterName   string              `json:"clusterName"`
	TriggerSource string              `json:"triggerSource"`
	Status        string              `json:"status"`
	RiskLevel     string              `json:"riskLevel"`
	Summary       string              `json:"summary"`
	Counts        aiInspectionCounts  `json:"counts"`
	Issues        []aiInspectionIssue `json:"issues"`
	GeneratedAt   time.Time           `json:"generatedAt"`
	CompletedAt   time.Time           `json:"completedAt"`
}

type aiRiskSummaryResponse struct {
	ClusterID   string              `json:"clusterId,omitempty"`
	ClusterName string              `json:"clusterName,omitempty"`
	RiskLevel   string              `json:"riskLevel"`
	Summary     string              `json:"summary"`
	Counts      aiInspectionCounts  `json:"counts"`
	TopIssues   []aiInspectionIssue `json:"topIssues"`
	GeneratedAt time.Time           `json:"generatedAt"`
}

func NewAIInspectionRunner(
	inspectionStore *store.AIInspectionStore,
	issueStore *store.AIIssueStore,
	clusterStore *store.ClusterStore,
	auditStore *store.AuditStore,
	snapshotStore *store.SnapshotStore,
	k8sManager *k8s.Manager,
) *AIInspectionRunner {
	return &AIInspectionRunner{
		inspectionStore:  inspectionStore,
		issueStore:       issueStore,
		clusterStore:     clusterStore,
		auditStore:       auditStore,
		dashboardService: service.NewDashboardService(snapshotStore, k8sManager),
		nodesService:     service.NewNodesService(snapshotStore, k8sManager),
		podsService:      service.NewPodsService(snapshotStore, k8sManager),
		workloadsService: service.NewWorkloadsService(snapshotStore, k8sManager),
		k8sManager:       k8sManager,
	}
}

func (r *AIInspectionRunner) Run(ctx context.Context, clusterID string, triggerSource string) (*aiInspectionResult, error) {
	result, err := r.buildInspectionResult(ctx, clusterID, triggerSource)
	if err != nil {
		clusterName := r.lookupClusterName(ctx, clusterID)
		if r.inspectionStore != nil {
			_, _ = r.inspectionStore.Save(ctx, store.AIInspectionInput{
				ClusterID:     strings.TrimSpace(clusterID),
				ClusterName:   clusterName,
				TriggerSource: triggerSource,
				Status:        store.AIInspectionStatusFailed,
				RiskLevel:     "high",
				Summary:       "AI 主动巡检执行失败",
				ErrorMessage:  err.Error(),
				Payload: map[string]any{
					"clusterId":     strings.TrimSpace(clusterID),
					"clusterName":   clusterName,
					"triggerSource": triggerSource,
					"status":        store.AIInspectionStatusFailed,
					"errorMessage":  err.Error(),
					"generatedAt":   time.Now().UTC(),
				},
			})
		}
		if triggerSource == store.AIInspectionTriggerManual {
			r.recordInspectionAudit(ctx, clusterID, clusterName, store.AuditStatusFailed, err.Error())
		}
		return nil, err
	}

	if r.inspectionStore != nil {
		saved, saveErr := r.inspectionStore.Save(ctx, store.AIInspectionInput{
			ClusterID:     result.ClusterID,
			ClusterName:   result.ClusterName,
			TriggerSource: result.TriggerSource,
			Status:        result.Status,
			RiskLevel:     result.RiskLevel,
			Summary:       result.Summary,
			Payload:       result,
			CompletedAt:   result.CompletedAt,
		})
		if saveErr != nil {
			return nil, saveErr
		}
		result.ID = saved.ID
	}

	if r.issueStore != nil {
		syncEntries := make([]store.AIIssueSyncEntry, 0, len(result.Issues))
		for _, issue := range result.Issues {
			syncEntries = append(syncEntries, store.AIIssueSyncEntry{
				IssueKey:      issue.ID,
				Category:      issue.Category,
				Title:         issue.Title,
				Summary:       issue.Summary,
				RiskLevel:     issue.RiskLevel,
				Score:         issue.Score,
				AffectedCount: issue.AffectedCount,
				Target:        issue.Target,
				Evidence:      issue.Evidence,
				Actions:       issue.Actions,
			})
		}
		if err := r.issueStore.SyncInspection(ctx, store.SyncAIIssuesInput{
			ClusterID:   result.ClusterID,
			ClusterName: result.ClusterName,
			SourceID:    result.ID,
			DetectedAt:  result.CompletedAt,
			Issues:      syncEntries,
		}); err != nil {
			return nil, err
		}
	}

	if triggerSource == store.AIInspectionTriggerManual {
		r.recordInspectionAudit(ctx, result.ClusterID, result.ClusterName, store.AuditStatusSuccess, result.Summary)
	}

	return result, nil
}

func (r *AIInspectionRunner) RunEnabledClusters(ctx context.Context, triggerSource string) {
	if r.clusterStore == nil {
		return
	}

	clusters, err := r.clusterStore.List(ctx)
	if err != nil {
		return
	}

	for _, cluster := range clusters {
		if !cluster.IsEnabled {
			continue
		}
		_, _ = r.Run(ctx, cluster.ID, triggerSource)
	}
}

func (r *AIInspectionRunner) buildInspectionResult(ctx context.Context, clusterID string, triggerSource string) (*aiInspectionResult, error) {
	bundle, err := r.buildBundle(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	issues := r.buildInspectionIssues(bundle)
	sort.Slice(issues, func(i, j int) bool {
		if issues[i].Score != issues[j].Score {
			return issues[i].Score > issues[j].Score
		}
		return strings.Compare(issues[i].Title, issues[j].Title) < 0
	})

	counts := countInspectionIssues(issues)
	riskLevel := inspectionRiskLevelFromIssues(issues)
	summary := buildInspectionSummary(bundle.Status.ClusterName, issues)

	completedAt := time.Now().UTC()
	return &aiInspectionResult{
		ClusterID:     bundle.Status.ClusterID,
		ClusterName:   bundle.Status.ClusterName,
		TriggerSource: coalesceInspectionTrigger(triggerSource),
		Status:        store.AIInspectionStatusSuccess,
		RiskLevel:     riskLevel,
		Summary:       summary,
		Counts:        counts,
		Issues:        issues,
		GeneratedAt:   bundle.Status.GeneratedAt,
		CompletedAt:   completedAt,
	}, nil
}

func (r *AIInspectionRunner) buildBundle(ctx context.Context, clusterID string) (aiDiagnosisBundle, error) {
	overviewPayload, err := r.dashboardService.OverviewPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	nodesPayload, err := r.nodesService.ListPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	podsPayload, err := r.podsService.ListPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	deploymentsPayload, err := r.workloadsService.ListPayload(ctx, clusterID, "deployments")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	statefulSetsPayload, err := r.workloadsService.ListPayload(ctx, clusterID, "statefulsets")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	daemonSetsPayload, err := r.workloadsService.ListPayload(ctx, clusterID, "daemonsets")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	cronJobsPayload, err := r.workloadsService.ListPayload(ctx, clusterID, "cronjobs")
	if err != nil {
		return aiDiagnosisBundle{}, err
	}
	recentEventsPayload, err := r.dashboardService.RecentEventsPayload(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}

	var (
		overview     service.DashboardOverview
		nodes        []service.NodeListItem
		pods         []service.PodListItem
		deployments  []service.WorkloadItem
		statefulSets []service.WorkloadItem
		daemonSets   []service.WorkloadItem
		cronJobs     []service.WorkloadItem
		recentEvents []service.DashboardEvent
	)

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

	connectionResult, err := r.k8sManager.CheckClusterSelection(ctx, clusterID)
	if err != nil {
		return aiDiagnosisBundle{}, err
	}

	clusterName := strings.TrimSpace(connectionResult.ClusterName)
	clusterRefID := strings.TrimSpace(connectionResult.ClusterID)
	if clusterName == "" && r.clusterStore != nil {
		cluster, clusterErr := r.lookupCluster(ctx, clusterID)
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

func (r *AIInspectionRunner) buildInspectionIssues(bundle aiDiagnosisBundle) []aiInspectionIssue {
	issues := make([]aiInspectionIssue, 0, 8)
	issues = append(issues, inspectionIssueForOfflineNodes(bundle.Nodes)...)
	issues = append(issues, inspectionIssueForNodePressure(bundle.Nodes)...)
	issues = append(issues, inspectionIssueForProblemPods(bundle.Pods)...)
	issues = append(issues, inspectionIssueForWorkloads(bundle.Status.WorkloadAlerts)...)
	issues = append(issues, inspectionIssueForWarningEvents(bundle.RecentEvents)...)
	return issues
}

func inspectionIssueForOfflineNodes(nodes []service.NodeListItem) []aiInspectionIssue {
	offline := make([]service.NodeListItem, 0)
	for _, node := range nodes {
		if strings.EqualFold(strings.TrimSpace(node.Status), "offline") {
			offline = append(offline, node)
		}
	}
	if len(offline) == 0 {
		return nil
	}

	evidence := make([]aiDiagnosisEvidence, 0, len(offline))
	for _, node := range offline {
		evidence = append(evidence, aiDiagnosisEvidence{
			ID:       "inspection-node-offline-" + node.Name,
			Type:     "status",
			Severity: "critical",
			Title:    fmt.Sprintf("节点 %s 不在线", node.Name),
			Summary:  fmt.Sprintf("节点状态为 %s，可调度=%t，当前挂载 Pod 数=%d", node.Status, node.Schedulable, node.Pods),
			Target:   newNodeTargetRef(node.Name),
		})
	}

	firstTarget := newNodeTargetRef(offline[0].Name)
	return []aiInspectionIssue{
		{
			ID:            "node-offline",
			Category:      "node",
			Title:         "存在离线节点",
			Summary:       fmt.Sprintf("发现 %d 个节点离线，可能影响调度与现有业务稳定性。", len(offline)),
			RiskLevel:     "critical",
			Score:         95,
			AffectedCount: len(offline),
			Target:        firstTarget,
			Evidence:      limitInspectionEvidence(evidence, 4),
			Actions: []aiDiagnosisAction{
				{
					Title:       "优先检查离线节点详情",
					Description: "确认节点是否宕机、网络断连或 kubelet 异常。",
					Priority:    "p1",
					ActionType:  "inspect",
					CommandHint: buildNodeInspectCommand(firstTarget),
					Target:      firstTarget,
				},
			},
		},
	}
}

func inspectionIssueForNodePressure(nodes []service.NodeListItem) []aiInspectionIssue {
	pressure := make([]service.NodeListItem, 0)
	for _, node := range nodes {
		if strings.EqualFold(strings.TrimSpace(node.Status), "offline") {
			continue
		}
		if node.CPUUsage >= 85 || node.MemoryUsage >= 85 || !node.Schedulable {
			pressure = append(pressure, node)
		}
	}
	if len(pressure) == 0 {
		return nil
	}

	sort.Slice(pressure, func(i, j int) bool {
		left := maxInspectionInt(pressure[i].CPUUsage, pressure[i].MemoryUsage)
		right := maxInspectionInt(pressure[j].CPUUsage, pressure[j].MemoryUsage)
		return left > right
	})

	evidence := make([]aiDiagnosisEvidence, 0, len(pressure))
	for _, node := range pressure {
		severity := "medium"
		if node.CPUUsage >= 90 || node.MemoryUsage >= 90 {
			severity = "high"
		}
		if !node.Schedulable {
			severity = "high"
		}
		evidence = append(evidence, aiDiagnosisEvidence{
			ID:       "inspection-node-pressure-" + node.Name,
			Type:     "metric",
			Severity: severity,
			Title:    fmt.Sprintf("节点 %s 压力偏高", node.Name),
			Summary:  fmt.Sprintf("CPU %d%%，内存 %d%%，可调度=%t", node.CPUUsage, node.MemoryUsage, node.Schedulable),
			Target:   newNodeTargetRef(node.Name),
		})
	}

	firstTarget := newNodeTargetRef(pressure[0].Name)
	score := 72
	if maxInspectionInt(pressure[0].CPUUsage, pressure[0].MemoryUsage) >= 90 {
		score = 84
	}
	return []aiInspectionIssue{
		{
			ID:            "node-pressure",
			Category:      "node",
			Title:         "节点资源压力升高",
			Summary:       fmt.Sprintf("发现 %d 个节点 CPU 或内存压力偏高，建议优先检查热点节点和调度分布。", len(pressure)),
			RiskLevel:     riskLevelFromScore(score),
			Score:         score,
			AffectedCount: len(pressure),
			Target:        firstTarget,
			Evidence:      limitInspectionEvidence(evidence, 4),
			Actions: []aiDiagnosisAction{
				{
					Title:       "查看热点节点详情",
					Description: "确认是否存在单节点热点、驱逐风险或不可调度状态。",
					Priority:    "p1",
					ActionType:  "inspect",
					CommandHint: buildNodeInspectCommand(firstTarget),
					Target:      firstTarget,
				},
			},
		},
	}
}

func inspectionIssueForProblemPods(pods []service.PodListItem) []aiInspectionIssue {
	type podGroup struct {
		Status string
		Items  []service.PodListItem
		Score  int
		Risk   string
	}

	groupMap := map[string]*podGroup{}
	for _, pod := range pods {
		status := strings.TrimSpace(pod.Status)
		if status == "" {
			continue
		}
		lowerStatus := strings.ToLower(status)
		if lowerStatus == "running" || lowerStatus == "succeeded" {
			continue
		}

		score, risk := podIssueSeverity(status)
		group, ok := groupMap[status]
		if !ok {
			group = &podGroup{
				Status: status,
				Score:  score,
				Risk:   risk,
				Items:  make([]service.PodListItem, 0),
			}
			groupMap[status] = group
		}
		group.Items = append(group.Items, pod)
	}

	if len(groupMap) == 0 {
		return nil
	}

	groups := make([]podGroup, 0, len(groupMap))
	for _, group := range groupMap {
		groups = append(groups, *group)
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Score != groups[j].Score {
			return groups[i].Score > groups[j].Score
		}
		return len(groups[i].Items) > len(groups[j].Items)
	})

	top := groups[0]
	evidence := make([]aiDiagnosisEvidence, 0, len(top.Items))
	for _, pod := range top.Items {
		evidence = append(evidence, aiDiagnosisEvidence{
			ID:       fmt.Sprintf("inspection-pod-%s-%s", pod.Namespace, pod.Name),
			Type:     "status",
			Severity: top.Risk,
			Title:    fmt.Sprintf("Pod %s/%s 状态异常", pod.Namespace, pod.Name),
			Summary:  fmt.Sprintf("状态=%s，节点=%s，CPU=%d%%，内存=%d%%", pod.Status, pod.Node, pod.CPUUsage, pod.MemoryUsage),
			Target:   newPodTargetRef(pod.Namespace, pod.Name),
		})
	}

	firstTarget := newPodTargetRef(top.Items[0].Namespace, top.Items[0].Name)
	return []aiInspectionIssue{
		{
			ID:            "pod-" + normalizeInspectionKey(top.Status),
			Category:      "pod",
			Title:         fmt.Sprintf("存在 %s Pod", top.Status),
			Summary:       fmt.Sprintf("当前有 %d 个 Pod 处于 %s 状态，建议优先排查对应事件、日志与控制器状态。", len(top.Items), top.Status),
			RiskLevel:     top.Risk,
			Score:         top.Score + minInspectionInt(len(top.Items)*2, 8),
			AffectedCount: len(top.Items),
			Target:        firstTarget,
			Evidence:      limitInspectionEvidence(evidence, 4),
			Actions: []aiDiagnosisAction{
				{
					Title:       "查看异常 Pod 详情",
					Description: "优先检查 Pod 详情、事件和日志，确认是否为调度、镜像或启动异常。",
					Priority:    priorityFromSeverity(top.Risk),
					ActionType:  "inspect",
					CommandHint: buildPodInspectCommand(firstTarget),
					Target:      firstTarget,
				},
			},
		},
	}
}

func inspectionIssueForWorkloads(items []aiDiagnosisWorkloadHint) []aiInspectionIssue {
	if len(items) == 0 {
		return nil
	}

	sort.Slice(items, func(i, j int) bool {
		leftGap := absInspectionInt32(items[i].Desired-items[i].Available) + absInspectionInt32(items[i].Desired-items[i].Ready)
		rightGap := absInspectionInt32(items[j].Desired-items[j].Available) + absInspectionInt32(items[j].Desired-items[j].Ready)
		return leftGap > rightGap
	})

	affected := 0
	evidence := make([]aiDiagnosisEvidence, 0, len(items))
	for _, item := range items {
		affected++
		severity := "medium"
		if item.Desired > 0 && item.Available == 0 {
			severity = "high"
		}
		if item.Paused {
			severity = "medium"
		}
		target := newWorkloadTargetRef(item.Scope, item.Namespace, item.Name)
		evidence = append(evidence, aiDiagnosisEvidence{
			ID:       fmt.Sprintf("inspection-workload-%s-%s-%s", item.Scope, item.Namespace, item.Name),
			Type:     "status",
			Severity: severity,
			Title:    fmt.Sprintf("%s/%s 不完全就绪", item.Namespace, item.Name),
			Summary:  fmt.Sprintf("scope=%s，ready=%d，desired=%d，available=%d，paused=%t", item.Scope, item.Ready, item.Desired, item.Available, item.Paused),
			Target:   target,
		})
	}

	firstTarget := newWorkloadTargetRef(items[0].Scope, items[0].Namespace, items[0].Name)
	score := 68
	if items[0].Desired > 0 && items[0].Available == 0 {
		score = 82
	}
	return []aiInspectionIssue{
		{
			ID:            "workload-availability",
			Category:      "workload",
			Title:         "存在未就绪工作负载",
			Summary:       fmt.Sprintf("发现 %d 个工作负载未达到预期副本数，可能影响服务可用性。", affected),
			RiskLevel:     riskLevelFromScore(score),
			Score:         score,
			AffectedCount: affected,
			Target:        firstTarget,
			Evidence:      limitInspectionEvidence(evidence, 4),
			Actions: []aiDiagnosisAction{
				{
					Title:       "查看工作负载详情",
					Description: "确认副本差异、暂停状态和关联 Pod 健康情况。",
					Priority:    "p1",
					ActionType:  "inspect",
					CommandHint: buildWorkloadInspectCommand(firstTarget),
					Target:      firstTarget,
				},
			},
		},
	}
}

func inspectionIssueForWarningEvents(events []service.DashboardEvent) []aiInspectionIssue {
	warnings := make([]service.DashboardEvent, 0)
	for _, event := range events {
		eventType := strings.ToLower(strings.TrimSpace(event.Type))
		if eventType == "warning" || eventType == "error" {
			warnings = append(warnings, event)
			continue
		}

		combined := strings.ToLower(strings.TrimSpace(event.Reason + " " + event.Message))
		if strings.Contains(combined, "failed") || strings.Contains(combined, "backoff") || strings.Contains(combined, "unhealthy") {
			warnings = append(warnings, event)
		}
	}
	if len(warnings) == 0 {
		return nil
	}

	evidence := make([]aiDiagnosisEvidence, 0, len(warnings))
	for _, event := range warnings {
		target := targetRefFromDashboardEvent(event.InvolvedObject)
		evidence = append(evidence, aiDiagnosisEvidence{
			ID:        "inspection-event-" + event.ID,
			Type:      "event",
			Severity:  "medium",
			Title:     event.Reason,
			Summary:   truncateText(event.Message, 140),
			Timestamp: event.Timestamp,
			Target:    target,
		})
	}

	firstTarget := evidence[0].Target
	return []aiInspectionIssue{
		{
			ID:            "warning-events",
			Category:      "event",
			Title:         "近期存在异常事件",
			Summary:       fmt.Sprintf("最近采集到 %d 条告警类事件，建议结合事件趋势确认是否为持续异常。", len(warnings)),
			RiskLevel:     riskLevelFromScore(62 + minInspectionInt(len(warnings), 12)),
			Score:         62 + minInspectionInt(len(warnings), 12),
			AffectedCount: len(warnings),
			Target:        firstTarget,
			Evidence:      limitInspectionEvidence(evidence, 5),
			Actions: []aiDiagnosisAction{
				{
					Title:       "查看相关资源详情",
					Description: "优先确认异常事件是否持续出现，以及是否已影响具体资源。",
					Priority:    "p2",
					ActionType:  "inspect",
					Target:      firstTarget,
				},
			},
		},
	}
}

func countInspectionIssues(issues []aiInspectionIssue) aiInspectionCounts {
	counts := aiInspectionCounts{Total: len(issues)}
	for _, issue := range issues {
		switch strings.ToLower(strings.TrimSpace(issue.RiskLevel)) {
		case "critical":
			counts.Critical++
		case "high":
			counts.High++
		case "medium":
			counts.Medium++
		default:
			counts.Low++
		}
	}
	return counts
}

func inspectionRiskLevelFromIssues(issues []aiInspectionIssue) string {
	if len(issues) == 0 {
		return "low"
	}
	return riskLevelFromScore(issues[0].Score)
}

func buildInspectionSummary(clusterName string, issues []aiInspectionIssue) string {
	if len(issues) == 0 {
		return fmt.Sprintf("%s 当前未发现需要优先处理的高风险异常，可继续观察近期事件和资源波动。", strings.TrimSpace(clusterName))
	}

	top := issues[0]
	if len(issues) == 1 {
		return fmt.Sprintf("当前最需要关注的是“%s”，影响对象 %d 个。%s", top.Title, top.AffectedCount, top.Summary)
	}

	second := issues[1]
	return fmt.Sprintf("当前巡检发现 %d 个需要关注的问题，最优先处理“%s”，其次关注“%s”。", len(issues), top.Title, second.Title)
}

func riskLevelFromScore(score int) string {
	switch {
	case score >= 90:
		return "critical"
	case score >= 75:
		return "high"
	case score >= 55:
		return "medium"
	default:
		return "low"
	}
}

func podIssueSeverity(status string) (int, string) {
	lower := strings.ToLower(strings.TrimSpace(status))
	switch {
	case strings.Contains(lower, "crashloopbackoff"), strings.Contains(lower, "imagepullbackoff"), strings.Contains(lower, "errimagepull"):
		return 86, "high"
	case strings.Contains(lower, "pending"), strings.Contains(lower, "containercreating"), strings.Contains(lower, "init"):
		return 74, "medium"
	case strings.Contains(lower, "failed"), strings.Contains(lower, "unknown"):
		return 82, "high"
	default:
		return 66, "medium"
	}
}

func limitInspectionEvidence(items []aiDiagnosisEvidence, limit int) []aiDiagnosisEvidence {
	if len(items) <= limit {
		return items
	}
	return items[:limit]
}

func normalizeInspectionKey(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	replacer := strings.NewReplacer(" ", "-", "_", "-", "/", "-", ".", "-", ":", "-")
	return replacer.Replace(value)
}

func buildPodInspectCommand(target *aiDiagnosisTargetRef) string {
	if target == nil || target.Kind != "pod" || target.Namespace == "" {
		return ""
	}
	return fmt.Sprintf("kubectl -n %s describe pod %s", target.Namespace, target.Name)
}

func buildNodeInspectCommand(target *aiDiagnosisTargetRef) string {
	if target == nil || target.Kind != "node" {
		return ""
	}
	return fmt.Sprintf("kubectl describe node %s", target.Name)
}

func maxInspectionInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func minInspectionInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func absInspectionInt32(value int32) int {
	if value < 0 {
		return int(-value)
	}
	return int(value)
}

func coalesceInspectionTrigger(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return store.AIInspectionTriggerManual
	}
	return value
}

func (r *AIInspectionRunner) lookupCluster(ctx context.Context, clusterID string) (*store.Cluster, error) {
	if r.clusterStore == nil {
		return nil, nil
	}
	if strings.TrimSpace(clusterID) != "" {
		return r.clusterStore.GetByID(ctx, clusterID)
	}
	return r.clusterStore.GetDefault(ctx)
}

func (r *AIInspectionRunner) lookupClusterName(ctx context.Context, clusterID string) string {
	cluster, err := r.lookupCluster(ctx, clusterID)
	if err != nil || cluster == nil {
		return ""
	}
	return cluster.Name
}

func (r *AIInspectionRunner) recordInspectionAudit(ctx context.Context, clusterID string, clusterName string, status store.AuditStatus, message string) {
	if r.auditStore == nil {
		return
	}

	_ = r.auditStore.Record(ctx, store.AuditLogInput{
		Action:       "ai.inspection.run",
		ResourceType: "ai-inspection",
		ResourceName: "latest",
		ClusterID:    strings.TrimSpace(clusterID),
		ClusterName:  strings.TrimSpace(clusterName),
		Status:       status,
		Message:      strings.TrimSpace(message),
		ActorName:    "系统",
		ActorEmail:   "system@k8s-agent.local",
		Details: map[string]any{
			"triggerSource": "manual",
		},
	})
}

func decodeStoredInspection(item *store.AIInspection) (*aiInspectionResult, error) {
	if item == nil {
		return nil, nil
	}

	result := &aiInspectionResult{}
	if len(item.Payload) > 0 {
		if err := json.Unmarshal(item.Payload, result); err != nil {
			return nil, err
		}
	}

	result.ID = item.ID
	result.ClusterID = coalesceString(result.ClusterID, item.ClusterID)
	result.ClusterName = coalesceString(result.ClusterName, item.ClusterName)
	result.TriggerSource = coalesceString(result.TriggerSource, item.TriggerSource)
	result.Status = coalesceString(result.Status, item.Status)
	result.RiskLevel = coalesceString(result.RiskLevel, item.RiskLevel)
	result.Summary = coalesceString(result.Summary, item.Summary)
	if result.GeneratedAt.IsZero() {
		result.GeneratedAt = item.CompletedAt
	}
	if result.CompletedAt.IsZero() {
		result.CompletedAt = item.CompletedAt
	}

	return result, nil
}

func (h *handler) latestAIInspection(w http.ResponseWriter, r *http.Request) error {
	if h.aiInspectionStore == nil {
		writeJSON(w, http.StatusOK, nil)
		return nil
	}

	item, err := h.aiInspectionStore.GetLatest(r.Context(), requestedClusterID(r))
	if err != nil {
		return err
	}
	if item == nil {
		writeJSON(w, http.StatusOK, nil)
		return nil
	}

	result, err := decodeStoredInspection(item)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, result)
	return nil
}

func (h *handler) listAIInspections(w http.ResponseWriter, r *http.Request) error {
	if h.aiInspectionStore == nil {
		writeJSON(w, http.StatusOK, []aiInspectionResult{})
		return nil
	}

	items, err := h.aiInspectionStore.List(r.Context(), requestedClusterID(r), parseIntQueryParam(r, "limit", 10))
	if err != nil {
		return err
	}

	results := make([]aiInspectionResult, 0, len(items))
	for index := range items {
		result, decodeErr := decodeStoredInspection(&items[index])
		if decodeErr != nil {
			return decodeErr
		}
		if result != nil {
			results = append(results, *result)
		}
	}

	writeJSON(w, http.StatusOK, results)
	return nil
}

func (h *handler) runAIInspection(w http.ResponseWriter, r *http.Request) error {
	if h.aiInspectionRunner == nil {
		return newHTTPError(http.StatusServiceUnavailable, "AI 巡检能力尚未初始化")
	}

	var payload aiInspectionRunRequest
	if err := decodeJSON(r, &payload); err != nil && !strings.Contains(err.Error(), io.EOF.Error()) {
		return newHTTPError(http.StatusBadRequest, err.Error())
	}

	clusterID := strings.TrimSpace(payload.ClusterID)
	if clusterID == "" {
		clusterID = requestedClusterID(r)
	}

	result, err := h.aiInspectionRunner.Run(r.Context(), clusterID, store.AIInspectionTriggerManual)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, result)
	return nil
}

func (h *handler) aiRiskSummary(w http.ResponseWriter, r *http.Request) error {
	if h.aiInspectionStore == nil {
		writeJSON(w, http.StatusOK, nil)
		return nil
	}

	item, err := h.aiInspectionStore.GetLatest(r.Context(), requestedClusterID(r))
	if err != nil {
		return err
	}
	if item == nil {
		writeJSON(w, http.StatusOK, nil)
		return nil
	}

	result, err := decodeStoredInspection(item)
	if err != nil {
		return err
	}

	topIssues := result.Issues
	if len(topIssues) > 3 {
		topIssues = topIssues[:3]
	}
	writeJSON(w, http.StatusOK, aiRiskSummaryResponse{
		ClusterID:   result.ClusterID,
		ClusterName: result.ClusterName,
		RiskLevel:   result.RiskLevel,
		Summary:     result.Summary,
		Counts:      result.Counts,
		TopIssues:   topIssues,
		GeneratedAt: result.GeneratedAt,
	})
	return nil
}

func parseIntQueryParam(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
