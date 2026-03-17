package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var (
	ErrWorkloadNotFound          = errors.New("workload not found")
	ErrWorkloadActionUnsupported = errors.New("workload action not supported")
	ErrWorkloadLiveClusterNeeded = errors.New("workload action requires a live cluster")
)

type WorkloadsService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type WorkloadItem struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Paused       bool              `json:"paused,omitempty"`
	Ready        int32             `json:"ready"`
	Desired      int32             `json:"desired"`
	Available    int32             `json:"available"`
	UpToDate     int32             `json:"upToDate"`
	Age          string            `json:"age"`
	Images       []string          `json:"images"`
	Labels       map[string]string `json:"labels"`
	Selector     map[string]string `json:"selector,omitempty"`
	Strategy     string            `json:"strategy,omitempty"`
	ServiceName  string            `json:"serviceName,omitempty"`
	Schedule     string            `json:"schedule,omitempty"`
	LastSchedule string            `json:"lastSchedule,omitempty"`
}

func NewWorkloadsService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *WorkloadsService {
	return &WorkloadsService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *WorkloadsService) ListPayload(ctx context.Context, clusterID string, scope string) (json.RawMessage, error) {
	items, err := s.list(ctx, clusterID, scope)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *WorkloadsService) DetailPayload(ctx context.Context, clusterID string, scope string, namespace string, name string) (json.RawMessage, error) {
	listPayload, err := s.ListPayload(ctx, clusterID, scope)
	if err != nil {
		return nil, err
	}

	item, err := findNamespacedPayload(listPayload, namespace, name)
	if err != nil {
		return nil, err
	}

	return item, nil
}

func (s *WorkloadsService) Scale(
	ctx context.Context,
	clusterID string,
	scope string,
	namespace string,
	name string,
	replicas int32,
) (WorkloadItem, error) {
	if replicas < 0 {
		return WorkloadItem{}, fmt.Errorf("replicas must be greater than or equal to 0")
	}

	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return WorkloadItem{}, ErrWorkloadLiveClusterNeeded
	case err != nil:
		return WorkloadItem{}, err
	}

	switch scope {
	case "deployments":
		item, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		item.Spec.Replicas = int32Pointer(replicas)
		updated, err := clientset.AppsV1().Deployments(namespace).Update(ctx, item, metav1.UpdateOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		return mapDeployment(*updated), nil
	case "statefulsets":
		item, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		item.Spec.Replicas = int32Pointer(replicas)
		updated, err := clientset.AppsV1().StatefulSets(namespace).Update(ctx, item, metav1.UpdateOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		return mapStatefulSet(*updated), nil
	default:
		return WorkloadItem{}, ErrWorkloadActionUnsupported
	}
}

func (s *WorkloadsService) Restart(
	ctx context.Context,
	clusterID string,
	scope string,
	namespace string,
	name string,
) (WorkloadItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return WorkloadItem{}, ErrWorkloadLiveClusterNeeded
	case err != nil:
		return WorkloadItem{}, err
	}

	restartedAt := time.Now().UTC().Format(time.RFC3339)

	switch scope {
	case "deployments":
		item, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		item.Spec.Template.Annotations = withRestartAnnotation(item.Spec.Template.Annotations, restartedAt)
		updated, err := clientset.AppsV1().Deployments(namespace).Update(ctx, item, metav1.UpdateOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		return mapDeployment(*updated), nil
	case "statefulsets":
		item, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		item.Spec.Template.Annotations = withRestartAnnotation(item.Spec.Template.Annotations, restartedAt)
		updated, err := clientset.AppsV1().StatefulSets(namespace).Update(ctx, item, metav1.UpdateOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		return mapStatefulSet(*updated), nil
	case "daemonsets":
		item, err := clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		item.Spec.Template.Annotations = withRestartAnnotation(item.Spec.Template.Annotations, restartedAt)
		updated, err := clientset.AppsV1().DaemonSets(namespace).Update(ctx, item, metav1.UpdateOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		return mapDaemonSet(*updated), nil
	default:
		return WorkloadItem{}, ErrWorkloadActionUnsupported
	}
}

func (s *WorkloadsService) SetPaused(
	ctx context.Context,
	clusterID string,
	scope string,
	namespace string,
	name string,
	paused bool,
) (WorkloadItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return WorkloadItem{}, ErrWorkloadLiveClusterNeeded
	case err != nil:
		return WorkloadItem{}, err
	}

	switch scope {
	case "deployments":
		item, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return WorkloadItem{}, ErrWorkloadNotFound
		}
		if err != nil {
			return WorkloadItem{}, err
		}

		if item.Spec.Paused != paused {
			item.Spec.Paused = paused
			item, err = clientset.AppsV1().Deployments(namespace).Update(ctx, item, metav1.UpdateOptions{})
			if k8serrors.IsNotFound(err) {
				return WorkloadItem{}, ErrWorkloadNotFound
			}
			if err != nil {
				return WorkloadItem{}, err
			}
		}

		return mapDeployment(*item), nil
	default:
		return WorkloadItem{}, ErrWorkloadActionUnsupported
	}
}

func (s *WorkloadsService) Delete(
	ctx context.Context,
	clusterID string,
	scope string,
	namespace string,
	name string,
) error {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return ErrWorkloadLiveClusterNeeded
	case err != nil:
		return err
	}

	switch scope {
	case "deployments":
		if err := clientset.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
			if k8serrors.IsNotFound(err) {
				return ErrWorkloadNotFound
			}
			return err
		}
	case "statefulsets":
		if err := clientset.AppsV1().StatefulSets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
			if k8serrors.IsNotFound(err) {
				return ErrWorkloadNotFound
			}
			return err
		}
	case "daemonsets":
		if err := clientset.AppsV1().DaemonSets(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
			if k8serrors.IsNotFound(err) {
				return ErrWorkloadNotFound
			}
			return err
		}
	case "cronjobs":
		if err := clientset.BatchV1().CronJobs(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
			if k8serrors.IsNotFound(err) {
				return ErrWorkloadNotFound
			}
			return err
		}
	case "jobs":
		if err := clientset.BatchV1().Jobs(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
			if k8serrors.IsNotFound(err) {
				return ErrWorkloadNotFound
			}
			return err
		}
	default:
		return ErrWorkloadActionUnsupported
	}

	return nil
}

func (s *WorkloadsService) list(ctx context.Context, clusterID string, scope string) ([]WorkloadItem, error) {
	items, _, err := s.listWithSource(ctx, clusterID, scope)
	return items, err
}

func (s *WorkloadsService) listWithSource(ctx context.Context, clusterID string, scope string) ([]WorkloadItem, string, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		items, err := s.snapshotWorkloads(ctx, scope)
		return items, "snapshot", err
	case err != nil:
		return nil, "", err
	}

	var items []WorkloadItem
	switch scope {
	case "deployments":
		list, err := clientset.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, "", err
		}
		items = make([]WorkloadItem, 0, len(list.Items))
		for _, item := range list.Items {
			items = append(items, mapDeployment(item))
		}
	case "statefulsets":
		list, err := clientset.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, "", err
		}
		items = make([]WorkloadItem, 0, len(list.Items))
		for _, item := range list.Items {
			items = append(items, mapStatefulSet(item))
		}
	case "daemonsets":
		list, err := clientset.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, "", err
		}
		items = make([]WorkloadItem, 0, len(list.Items))
		for _, item := range list.Items {
			items = append(items, mapDaemonSet(item))
		}
	case "cronjobs":
		list, err := clientset.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, "", err
		}
		items = make([]WorkloadItem, 0, len(list.Items))
		for _, item := range list.Items {
			items = append(items, mapCronJob(item))
		}
	case "jobs":
		list, err := clientset.BatchV1().Jobs("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, "", err
		}
		items = make([]WorkloadItem, 0, len(list.Items))
		for _, item := range list.Items {
			items = append(items, mapJob(item))
		}
	default:
		return nil, "", fmt.Errorf("unsupported workload scope: %s", scope)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Namespace == items[j].Namespace {
			return items[i].Name < items[j].Name
		}
		return items[i].Namespace < items[j].Namespace
	})

	return items, "k8s", nil
}

func (s *WorkloadsService) snapshotWorkloads(ctx context.Context, scope string) ([]WorkloadItem, error) {
	payload, err := s.snapshotStore.Get(ctx, scope, "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []WorkloadItem{}, nil
	}

	var items []WorkloadItem
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func mapDeployment(item appsv1.Deployment) WorkloadItem {
	desired := int32(1)
	if item.Spec.Replicas != nil {
		desired = *item.Spec.Replicas
	}

	return WorkloadItem{
		ID:        fmt.Sprintf("%s-deployment", item.Name),
		Name:      item.Name,
		Namespace: item.Namespace,
		Paused:    item.Spec.Paused,
		Ready:     item.Status.ReadyReplicas,
		Desired:   desired,
		Available: item.Status.AvailableReplicas,
		UpToDate:  item.Status.UpdatedReplicas,
		Age:       formatAge(item.CreationTimestamp.Time, time.Now().UTC()),
		Images:    containerImages(item.Spec.Template.Spec.Containers),
		Labels:    copyStringMap(item.Labels),
		Selector:  copyStringMap(item.Spec.Selector.MatchLabels),
		Strategy:  string(item.Spec.Strategy.Type),
	}
}

func mapStatefulSet(item appsv1.StatefulSet) WorkloadItem {
	desired := int32(1)
	if item.Spec.Replicas != nil {
		desired = *item.Spec.Replicas
	}

	return WorkloadItem{
		ID:          fmt.Sprintf("%s-statefulset", item.Name),
		Name:        item.Name,
		Namespace:   item.Namespace,
		Ready:       item.Status.ReadyReplicas,
		Desired:     desired,
		Available:   item.Status.ReadyReplicas,
		UpToDate:    item.Status.UpdatedReplicas,
		Age:         formatAge(item.CreationTimestamp.Time, time.Now().UTC()),
		Images:      containerImages(item.Spec.Template.Spec.Containers),
		Labels:      copyStringMap(item.Labels),
		Selector:    copyStringMap(item.Spec.Selector.MatchLabels),
		ServiceName: item.Spec.ServiceName,
	}
}

func mapDaemonSet(item appsv1.DaemonSet) WorkloadItem {
	return WorkloadItem{
		ID:        fmt.Sprintf("%s-daemonset", item.Name),
		Name:      item.Name,
		Namespace: item.Namespace,
		Ready:     item.Status.NumberReady,
		Desired:   item.Status.DesiredNumberScheduled,
		Available: item.Status.NumberAvailable,
		UpToDate:  item.Status.UpdatedNumberScheduled,
		Age:       formatAge(item.CreationTimestamp.Time, time.Now().UTC()),
		Images:    containerImages(item.Spec.Template.Spec.Containers),
		Labels:    copyStringMap(item.Labels),
		Selector:  copyStringMap(item.Spec.Selector.MatchLabels),
	}
}

func mapCronJob(item batchv1.CronJob) WorkloadItem {
	lastSchedule := ""
	if item.Status.LastScheduleTime != nil {
		lastSchedule = formatAge(item.Status.LastScheduleTime.Time, time.Now().UTC())
	}

	return WorkloadItem{
		ID:           fmt.Sprintf("%s-cronjob", item.Name),
		Name:         item.Name,
		Namespace:    item.Namespace,
		Ready:        0,
		Desired:      0,
		Available:    0,
		UpToDate:     0,
		Age:          formatAge(item.CreationTimestamp.Time, time.Now().UTC()),
		Images:       containerImages(item.Spec.JobTemplate.Spec.Template.Spec.Containers),
		Labels:       copyStringMap(item.Labels),
		Schedule:     item.Spec.Schedule,
		LastSchedule: lastSchedule,
	}
}

func mapJob(item batchv1.Job) WorkloadItem {
	desired := int32(1)
	if item.Spec.Parallelism != nil {
		desired = *item.Spec.Parallelism
	}

	status := ""
	for _, condition := range item.Status.Conditions {
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			status = "Complete"
			break
		}
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			status = "Failed"
			break
		}
	}
	if status == "" {
		if item.Status.Active > 0 {
			status = "Running"
		} else {
			status = "Pending"
		}
	}

	return WorkloadItem{
		ID:        fmt.Sprintf("%s-job", item.Name),
		Name:      item.Name,
		Namespace: item.Namespace,
		Ready:     item.Status.Succeeded,
		Desired:   desired,
		Available: item.Status.Succeeded,
		UpToDate:  item.Status.Active,
		Age:       formatAge(item.CreationTimestamp.Time, time.Now().UTC()),
		Images:    containerImages(item.Spec.Template.Spec.Containers),
		Labels:    copyStringMap(item.Labels),
		Strategy:  status,
	}
}

func containerImages(containers []corev1.Container) []string {
	if len(containers) == 0 {
		return []string{}
	}

	images := make([]string, 0, len(containers))
	for _, container := range containers {
		images = append(images, container.Image)
	}

	return images
}

func withRestartAnnotation(annotations map[string]string, restartedAt string) map[string]string {
	next := copyStringMap(annotations)
	next["kubectl.kubernetes.io/restartedAt"] = restartedAt
	return next
}

func findNamespacedPayload(payload json.RawMessage, namespace string, name string) (json.RawMessage, error) {
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

	return nil, ErrWorkloadNotFound
}

func WorkloadNotFoundMessage(scope string, namespace string, name string) string {
	return fmt.Sprintf("%s not found: %s/%s", scope, namespace, name)
}

func int32Pointer(value int32) *int32 {
	return &value
}
