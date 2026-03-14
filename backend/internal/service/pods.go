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
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var (
	ErrPodNotFound          = errors.New("pod not found")
	ErrPodLiveClusterNeeded = errors.New("pod action requires a live cluster")
	ErrPodRestartUnsupported = errors.New("pod restart requires a controller-managed pod")
)

type PodsService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type PodListItem struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Status      string            `json:"status"`
	Node        string            `json:"node"`
	IP          string            `json:"ip"`
	Containers  []PodContainer    `json:"containers"`
	Age         string            `json:"age"`
	CPUUsage    int               `json:"cpuUsage"`
	MemoryUsage int               `json:"memoryUsage"`
	Labels      map[string]string `json:"labels"`
}

type PodContainer struct {
	Name         string `json:"name"`
	Ready        bool   `json:"ready"`
	RestartCount int32  `json:"restartCount"`
	Image        string `json:"image"`
}

type PodMetrics struct {
	CPUUsage        int       `json:"cpuUsage"`
	MemoryUsage     int       `json:"memoryUsage"`
	DiskUsage       int       `json:"diskUsage"`
	NetworkReceive  int       `json:"networkReceive"`
	NetworkTransmit int       `json:"networkTransmit"`
	Timestamp       time.Time `json:"timestamp"`
}

type PodLogEntry struct {
	Timestamp string `json:"timestamp"`
	Stream    string `json:"stream"`
	Message   string `json:"message"`
}

func NewPodsService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *PodsService {
	return &PodsService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *PodsService) ListPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	pods, err := s.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(pods)
}

func (s *PodsService) MetricsPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	pods, source, err := s.listWithSource(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	if source == "snapshot" {
		return s.snapshotMetricsPayload(ctx, namespace, name)
	}

	for _, pod := range pods {
		if pod.Namespace == namespace && pod.Name == name {
			return json.Marshal(PodMetrics{
				CPUUsage:        pod.CPUUsage,
				MemoryUsage:     pod.MemoryUsage,
				DiskUsage:       0,
				NetworkReceive:  0,
				NetworkTransmit: 0,
				Timestamp:       time.Now().UTC(),
			})
		}
	}

	return nil, ErrPodNotFound
}

func (s *PodsService) LogsPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotLogsPayload(ctx, namespace, name)
	case err != nil:
		return nil, err
	}

	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, ErrPodNotFound
	}

	logOptions := &corev1.PodLogOptions{
		TailLines: int64Ptr(100),
	}
	if len(pod.Spec.Containers) > 0 {
		logOptions.Container = pod.Spec.Containers[0].Name
	}

	data, err := clientset.CoreV1().Pods(namespace).GetLogs(name, logOptions).DoRaw(ctx)
	if err != nil {
		return json.Marshal([]PodLogEntry{})
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return json.Marshal([]PodLogEntry{})
	}

	entries := make([]PodLogEntry, 0, len(lines))
	now := time.Now().UTC().Format(time.RFC3339)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		entries = append(entries, PodLogEntry{
			Timestamp: now,
			Stream:    "stdout",
			Message:   line,
		})
	}

	return json.Marshal(entries)
}

func (s *PodsService) Delete(ctx context.Context, clusterID string, namespace string, name string) error {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return ErrPodLiveClusterNeeded
	case err != nil:
		return err
	}

	if err := clientset.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		if k8serrors.IsNotFound(err) {
			return ErrPodNotFound
		}
		return err
	}

	return nil
}

func (s *PodsService) Restart(ctx context.Context, clusterID string, namespace string, name string) error {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return ErrPodLiveClusterNeeded
	case err != nil:
		return err
	}

	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if k8serrors.IsNotFound(err) {
		return ErrPodNotFound
	}
	if err != nil {
		return err
	}

	if !hasControllerOwner(pod.OwnerReferences) {
		return ErrPodRestartUnsupported
	}

	if err := clientset.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		if k8serrors.IsNotFound(err) {
			return ErrPodNotFound
		}
		return err
	}

	return nil
}

func (s *PodsService) list(ctx context.Context, clusterID string) ([]PodListItem, error) {
	pods, _, err := s.listWithSource(ctx, clusterID)
	return pods, err
}

func (s *PodsService) listWithSource(ctx context.Context, clusterID string) ([]PodListItem, string, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		pods, err := s.snapshotPods(ctx)
		return pods, "snapshot", err
	case err != nil:
		return nil, "", err
	}

	podList, err := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, "", err
	}

	pods := make([]PodListItem, 0, len(podList.Items))
	for _, pod := range podList.Items {
		pods = append(pods, mapPod(pod))
	}

	sort.Slice(pods, func(i, j int) bool {
		if pods[i].Namespace == pods[j].Namespace {
			return pods[i].Name < pods[j].Name
		}
		return pods[i].Namespace < pods[j].Namespace
	})

	return pods, "k8s", nil
}

func (s *PodsService) snapshotPods(ctx context.Context) ([]PodListItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "pods", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []PodListItem{}, nil
	}

	var pods []PodListItem
	if err := json.Unmarshal(payload, &pods); err != nil {
		return nil, err
	}

	return pods, nil
}

func (s *PodsService) snapshotMetricsPayload(ctx context.Context, namespace string, name string) (json.RawMessage, error) {
	payload, err := s.snapshotStore.Get(ctx, "pods", "metrics")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, ErrPodNotFound
	}

	var metrics map[string]json.RawMessage
	if err := json.Unmarshal(payload, &metrics); err != nil {
		return nil, err
	}

	entryKey := fmt.Sprintf("%s/%s", namespace, name)
	entry, found := metrics[entryKey]
	if !found {
		return nil, ErrPodNotFound
	}

	return entry, nil
}

func (s *PodsService) snapshotLogsPayload(ctx context.Context, namespace string, name string) (json.RawMessage, error) {
	payload, err := s.snapshotStore.Get(ctx, "pods", "logs")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return json.Marshal([]PodLogEntry{})
	}

	var logs map[string]json.RawMessage
	if err := json.Unmarshal(payload, &logs); err != nil {
		return nil, err
	}

	entryKey := fmt.Sprintf("%s/%s", namespace, name)
	entry, found := logs[entryKey]
	if !found {
		return json.Marshal([]PodLogEntry{})
	}

	return entry, nil
}

func mapPod(pod corev1.Pod) PodListItem {
	cpuRequest, memoryRequest := requestedResources(pod)

	return PodListItem{
		ID:          pod.Name,
		Name:        pod.Name,
		Namespace:   pod.Namespace,
		Status:      podStatus(pod),
		Node:        pod.Spec.NodeName,
		IP:          pod.Status.PodIP,
		Containers:  mapPodContainers(pod),
		Age:         formatAge(pod.CreationTimestamp.Time, time.Now().UTC()),
		CPUUsage:    int(cpuRequest.MilliValue()),
		MemoryUsage: memoryMi(memoryRequest.Value()),
		Labels:      copyStringMap(pod.Labels),
	}
}

func hasControllerOwner(references []metav1.OwnerReference) bool {
	for _, reference := range references {
		if reference.Controller != nil && *reference.Controller {
			return true
		}
	}

	return false
}

func mapPodContainers(pod corev1.Pod) []PodContainer {
	statusByName := make(map[string]corev1.ContainerStatus, len(pod.Status.ContainerStatuses))
	for _, status := range pod.Status.ContainerStatuses {
		statusByName[status.Name] = status
	}

	containers := make([]PodContainer, 0, len(pod.Spec.Containers))
	for _, container := range pod.Spec.Containers {
		status := statusByName[container.Name]
		containers = append(containers, PodContainer{
			Name:         container.Name,
			Ready:        status.Ready,
			RestartCount: status.RestartCount,
			Image:        container.Image,
		})
	}

	return containers
}

func podStatus(pod corev1.Pod) string {
	if hasContainerFailure(pod) {
		return "failed"
	}

	switch pod.Status.Phase {
	case corev1.PodRunning:
		return "running"
	case corev1.PodSucceeded:
		return "succeeded"
	case corev1.PodFailed:
		return "failed"
	case corev1.PodPending:
		return "pending"
	default:
		return strings.ToLower(string(pod.Status.Phase))
	}
}

func hasContainerFailure(pod corev1.Pod) bool {
	for _, status := range pod.Status.ContainerStatuses {
		if status.State.Waiting == nil {
			continue
		}

		switch status.State.Waiting.Reason {
		case "CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull", "CreateContainerConfigError", "RunContainerError":
			return true
		}
	}

	return false
}

func formatAge(from time.Time, now time.Time) string {
	if from.IsZero() {
		return "0m"
	}

	diff := now.Sub(from)
	if diff < time.Minute {
		return fmt.Sprintf("%ds", int(diff.Seconds()))
	}
	if diff < time.Hour {
		return fmt.Sprintf("%dm", int(diff.Minutes()))
	}
	if diff < 24*time.Hour {
		return fmt.Sprintf("%dh", int(diff.Hours()))
	}
	return fmt.Sprintf("%dd", int(diff.Hours()/24))
}

func memoryMi(bytes int64) int {
	if bytes <= 0 {
		return 0
	}

	return int(bytes / (1024 * 1024))
}

func FindPodPayload(payload json.RawMessage, namespace string, name string) (json.RawMessage, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	for _, item := range items {
		var meta struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		}
		if err := json.Unmarshal(item, &meta); err != nil {
			return nil, err
		}
		if meta.Name == name && meta.Namespace == namespace {
			return item, nil
		}
	}

	return nil, ErrPodNotFound
}

func PodNotFoundMessage(namespace string, name string) string {
	return fmt.Sprintf("Pod not found: %s/%s", namespace, name)
}

func int64Ptr(value int64) *int64 {
	return &value
}
