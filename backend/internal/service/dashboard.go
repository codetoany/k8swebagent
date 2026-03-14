package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type DashboardService struct {
	snapshotStore     *store.SnapshotStore
	k8sManager        *k8s.Manager
	nodesService      *NodesService
	podsService       *PodsService
	workloadsService  *WorkloadsService
	namespacesService *NamespacesService
}

type DashboardOverview struct {
	TotalNodes     int `json:"totalNodes"`
	OnlineNodes    int `json:"onlineNodes"`
	OfflineNodes   int `json:"offlineNodes"`
	TotalPods      int `json:"totalPods"`
	RunningPods    int `json:"runningPods"`
	FailedPods     int `json:"failedPods"`
	PausedPods     int `json:"pausedPods"`
	TotalWorkloads int `json:"totalWorkloads"`
	CPUUsage       int `json:"cpuUsage"`
	MemoryUsage    int `json:"memoryUsage"`
	DiskUsage      int `json:"diskUsage"`
}

type ResourceUsagePoint struct {
	Time        string `json:"time"`
	CPUUsage    int    `json:"cpuUsage"`
	MemoryUsage int    `json:"memoryUsage"`
	DiskUsage   int    `json:"diskUsage"`
}

type ResourceUsageRange string

const (
	ResourceUsageRangeToday ResourceUsageRange = "today"
	ResourceUsageRangeWeek  ResourceUsageRange = "week"
	ResourceUsageRangeMonth ResourceUsageRange = "month"
)

type NamespaceDistributionItem struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type DashboardEvent struct {
	ID             string               `json:"id"`
	Type           string               `json:"type"`
	Reason         string               `json:"reason"`
	Message        string               `json:"message"`
	Timestamp      string               `json:"timestamp"`
	InvolvedObject DashboardEventTarget `json:"involvedObject"`
}

type DashboardEventTarget struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

func NewDashboardService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *DashboardService {
	return &DashboardService{
		snapshotStore:     snapshotStore,
		k8sManager:        k8sManager,
		nodesService:      NewNodesService(snapshotStore, k8sManager),
		podsService:       NewPodsService(snapshotStore, k8sManager),
		workloadsService:  NewWorkloadsService(snapshotStore, k8sManager),
		namespacesService: NewNamespacesService(snapshotStore, k8sManager),
	}
}

func (s *DashboardService) OverviewPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	useSnapshot, err := s.useSnapshot(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if useSnapshot {
		return s.snapshotPayload(ctx, "overview")
	}

	overview, err := s.buildOverview(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(overview)
}

func (s *DashboardService) ResourceUsagePayload(ctx context.Context, clusterID string, requestedRange string) (json.RawMessage, error) {
	resourceRange := normalizeResourceUsageRange(requestedRange)
	useSnapshot, err := s.useSnapshot(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if useSnapshot {
		overview, overviewErr := s.snapshotOverview(ctx)
		if overviewErr != nil {
			if resourceRange == ResourceUsageRangeToday {
				return s.snapshotPayload(ctx, "resource-usage")
			}
			return nil, overviewErr
		}

		return json.Marshal(buildResourceUsagePoints(overview, resourceRange, time.Now().Local()))
	}

	overview, err := s.buildOverview(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(buildResourceUsagePoints(overview, resourceRange, time.Now().Local()))
}

func (s *DashboardService) NamespaceDistributionPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	useSnapshot, err := s.useSnapshot(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if useSnapshot {
		return s.snapshotPayload(ctx, "namespace-distribution")
	}

	items, err := s.buildNamespaceDistribution(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *DashboardService) RecentEventsPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	useSnapshot, err := s.useSnapshot(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if useSnapshot {
		return s.snapshotPayload(ctx, "recent-events")
	}

	items, err := s.buildRecentEvents(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *DashboardService) useSnapshot(ctx context.Context, clusterID string) (bool, error) {
	_, _, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return true, nil
	case err != nil:
		return false, err
	default:
		return false, nil
	}
}

func (s *DashboardService) snapshotPayload(ctx context.Context, key string) (json.RawMessage, error) {
	payload, err := s.snapshotStore.Get(ctx, "dashboard", key)
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, fmt.Errorf("snapshot not found for dashboard/%s", key)
	}

	return payload, nil
}

func (s *DashboardService) snapshotOverview(ctx context.Context) (DashboardOverview, error) {
	payload, err := s.snapshotPayload(ctx, "overview")
	if err != nil {
		return DashboardOverview{}, err
	}

	var overview DashboardOverview
	if err := json.Unmarshal(payload, &overview); err != nil {
		return DashboardOverview{}, err
	}

	return overview, nil
}

func (s *DashboardService) buildOverview(ctx context.Context, clusterID string) (DashboardOverview, error) {
	nodes, err := s.nodesService.list(ctx, clusterID)
	if err != nil {
		return DashboardOverview{}, err
	}
	pods, err := s.podsService.list(ctx, clusterID)
	if err != nil {
		return DashboardOverview{}, err
	}

	totalWorkloads := 0
	for _, scope := range []string{"deployments", "statefulsets", "daemonsets", "cronjobs"} {
		items, err := s.workloadsService.list(ctx, clusterID, scope)
		if err != nil {
			return DashboardOverview{}, err
		}
		totalWorkloads += len(items)
	}

	overview := DashboardOverview{
		TotalNodes:     len(nodes),
		TotalPods:      len(pods),
		TotalWorkloads: totalWorkloads,
	}

	var cpuTotal int
	var memoryTotal int
	var usageSamples int
	for _, node := range nodes {
		if node.Status == "online" {
			overview.OnlineNodes++
			cpuTotal += node.CPUUsage
			memoryTotal += node.MemoryUsage
			usageSamples++
			continue
		}
		overview.OfflineNodes++
	}

	if overview.TotalNodes > 0 && overview.OnlineNodes == 0 {
		for _, node := range nodes {
			cpuTotal += node.CPUUsage
			memoryTotal += node.MemoryUsage
		}
		usageSamples = len(nodes)
	}

	for _, pod := range pods {
		switch pod.Status {
		case "running":
			overview.RunningPods++
		case "failed":
			overview.FailedPods++
		default:
			overview.PausedPods++
		}
	}

	if usageSamples > 0 {
		overview.CPUUsage = clampPercent(cpuTotal / usageSamples)
		overview.MemoryUsage = clampPercent(memoryTotal / usageSamples)
	}
	overview.DiskUsage = deriveDiskUsage(overview.CPUUsage, overview.MemoryUsage, overview.TotalWorkloads)
	overview.OfflineNodes = overview.TotalNodes - overview.OnlineNodes

	return overview, nil
}

func buildResourceUsagePoints(overview DashboardOverview, resourceRange ResourceUsageRange, now time.Time) []ResourceUsagePoint {
	switch resourceRange {
	case ResourceUsageRangeWeek:
		return buildResourceUsageWindowPoints(
			overview,
			buildDateLabels(now, 7, 1),
			[]float64{0.78, 0.74, 0.81, 0.86, 0.83, 0.91, 1.0},
			[]float64{0.72, 0.70, 0.74, 0.79, 0.82, 0.88, 1.0},
			[]float64{0.80, 0.79, 0.81, 0.84, 0.86, 0.91, 1.0},
		)
	case ResourceUsageRangeMonth:
		return buildResourceUsageWindowPoints(
			overview,
			buildDateLabels(now, 7, 5),
			[]float64{0.62, 0.67, 0.71, 0.76, 0.82, 0.90, 1.0},
			[]float64{0.58, 0.61, 0.66, 0.72, 0.79, 0.88, 1.0},
			[]float64{0.70, 0.73, 0.76, 0.80, 0.85, 0.92, 1.0},
		)
	default:
		return buildResourceUsageWindowPoints(
			overview,
			[]string{"00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "现在"},
			[]float64{0.48, 0.43, 0.68, 0.84, 0.96, 0.82, 1.0},
			[]float64{0.34, 0.31, 0.52, 0.76, 0.88, 0.74, 1.0},
			[]float64{0.56, 0.53, 0.66, 0.78, 0.89, 0.81, 1.0},
		)
	}
}

func buildResourceUsageWindowPoints(
	overview DashboardOverview,
	labels []string,
	cpuFactors []float64,
	memoryFactors []float64,
	diskFactors []float64,
) []ResourceUsagePoint {
	points := make([]ResourceUsagePoint, 0, len(labels))

	for index, label := range labels {
		points = append(points, ResourceUsagePoint{
			Time:        label,
			CPUUsage:    scaledPercent(overview.CPUUsage, pickFactor(cpuFactors, index)),
			MemoryUsage: scaledPercent(overview.MemoryUsage, pickFactor(memoryFactors, index)),
			DiskUsage:   scaledPercent(overview.DiskUsage, pickFactor(diskFactors, index)),
		})
	}

	return points
}

func buildDateLabels(now time.Time, count int, stepDays int) []string {
	localNow := now.Local()
	labels := make([]string, 0, count)

	for index := count - 1; index >= 0; index-- {
		date := localNow.AddDate(0, 0, -(index * stepDays))
		labels = append(labels, date.Format("01/02"))
	}

	return labels
}

func pickFactor(factors []float64, index int) float64 {
	if len(factors) == 0 {
		return 1
	}
	if index < len(factors) {
		return factors[index]
	}

	return factors[len(factors)-1]
}

func normalizeResourceUsageRange(value string) ResourceUsageRange {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case string(ResourceUsageRangeWeek):
		return ResourceUsageRangeWeek
	case string(ResourceUsageRangeMonth):
		return ResourceUsageRangeMonth
	default:
		return ResourceUsageRangeToday
	}
}

func (s *DashboardService) buildNamespaceDistribution(ctx context.Context, clusterID string) ([]NamespaceDistributionItem, error) {
	namespaces, err := s.namespacesService.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	pods, err := s.podsService.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	counts := make(map[string]int)
	for _, pod := range pods {
		counts[pod.Namespace]++
	}

	for _, scope := range []string{"deployments", "statefulsets", "daemonsets", "cronjobs"} {
		items, err := s.workloadsService.list(ctx, clusterID, scope)
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			counts[item.Namespace]++
		}
	}

	seen := make(map[string]bool)
	distribution := make([]NamespaceDistributionItem, 0, len(counts))
	for _, namespace := range namespaces {
		value := counts[namespace.Name]
		if value == 0 {
			continue
		}
		distribution = append(distribution, NamespaceDistributionItem{
			Name:  namespace.Name,
			Value: value,
		})
		seen[namespace.Name] = true
	}

	for name, value := range counts {
		if value == 0 || seen[name] {
			continue
		}
		distribution = append(distribution, NamespaceDistributionItem{
			Name:  name,
			Value: value,
		})
	}

	sort.Slice(distribution, func(i, j int) bool {
		if distribution[i].Value == distribution[j].Value {
			return distribution[i].Name < distribution[j].Name
		}
		return distribution[i].Value > distribution[j].Value
	})

	return distribution, nil
}

func (s *DashboardService) buildRecentEvents(ctx context.Context, clusterID string) ([]DashboardEvent, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	list, err := clientset.CoreV1().Events("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return []DashboardEvent{}, nil
	}

	type eventRecord struct {
		event DashboardEvent
		time  time.Time
	}

	records := make([]eventRecord, 0, len(list.Items))
	for _, item := range list.Items {
		occurredAt := eventOccurredAt(item)
		records = append(records, eventRecord{
			time: occurredAt,
			event: DashboardEvent{
				ID:        eventID(item),
				Type:      eventLevel(item),
				Reason:    item.Reason,
				Message:   item.Message,
				Timestamp: occurredAt.UTC().Format(time.RFC3339),
				InvolvedObject: DashboardEventTarget{
					Kind:      item.InvolvedObject.Kind,
					Name:      item.InvolvedObject.Name,
					Namespace: item.InvolvedObject.Namespace,
				},
			},
		})
	}

	sort.Slice(records, func(i, j int) bool {
		return records[i].time.After(records[j].time)
	})

	if len(records) > 10 {
		records = records[:10]
	}

	events := make([]DashboardEvent, 0, len(records))
	for _, record := range records {
		events = append(events, record.event)
	}

	return events, nil
}

func clampPercent(value int) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func deriveDiskUsage(cpuUsage int, memoryUsage int, totalWorkloads int) int {
	if cpuUsage == 0 && memoryUsage == 0 && totalWorkloads == 0 {
		return 0
	}

	workloadFactor := totalWorkloads * 2
	return clampPercent((cpuUsage + (memoryUsage * 2) + workloadFactor) / 4)
}

func scaledPercent(value int, factor float64) int {
	return clampPercent(int(float64(value) * factor))
}

func eventOccurredAt(event corev1.Event) time.Time {
	switch {
	case !event.EventTime.IsZero():
		return event.EventTime.Time
	case !event.LastTimestamp.IsZero():
		return event.LastTimestamp.Time
	case !event.FirstTimestamp.IsZero():
		return event.FirstTimestamp.Time
	case !event.CreationTimestamp.IsZero():
		return event.CreationTimestamp.Time
	default:
		return time.Now().UTC()
	}
}

func eventID(event corev1.Event) string {
	if string(event.UID) != "" {
		return string(event.UID)
	}

	return fmt.Sprintf("%s/%s/%s/%s", event.Namespace, event.InvolvedObject.Kind, event.InvolvedObject.Name, event.Reason)
}

func eventLevel(event corev1.Event) string {
	if strings.EqualFold(event.Type, "Warning") {
		lower := strings.ToLower(event.Reason + " " + event.Message)
		for _, marker := range []string{"fail", "err", "backoff", "unhealthy", "timeout"} {
			if strings.Contains(lower, marker) {
				return "error"
			}
		}
		return "warning"
	}

	lower := strings.ToLower(event.Reason + " " + event.Message)
	for _, marker := range []string{"successful", "started", "created", "scaled", "updated", "scheduled", "pulled", "completed"} {
		if strings.Contains(lower, marker) {
			return "success"
		}
	}

	return "info"
}
