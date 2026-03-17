package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var (
	ErrConfigMapNotFound          = errors.New("configmap not found")
	ErrConfigMapLiveClusterNeeded = errors.New("configmap action requires a live cluster")
)

type ConfigMapsService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type ConfigMapItem struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	DataCount int               `json:"dataCount"`
	Age       string            `json:"age"`
	Labels    map[string]string `json:"labels"`
}

type ConfigMapDetail struct {
	ConfigMapItem
	Data map[string]string `json:"data"`
}

func NewConfigMapsService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *ConfigMapsService {
	return &ConfigMapsService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *ConfigMapsService) ListPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	items, err := s.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *ConfigMapsService) DetailPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotConfigMapDetail(ctx, namespace, name)
	case err != nil:
		return nil, err
	}

	item, err := clientset.CoreV1().ConfigMaps(namespace).Get(ctx, name, metav1.GetOptions{})
	if k8serrors.IsNotFound(err) {
		return nil, ErrConfigMapNotFound
	}
	if err != nil {
		return nil, err
	}

	return json.Marshal(mapConfigMapDetail(*item))
}

func (s *ConfigMapsService) Delete(ctx context.Context, clusterID string, namespace string, name string) error {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return ErrConfigMapLiveClusterNeeded
	case err != nil:
		return err
	}

	if err := clientset.CoreV1().ConfigMaps(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		if k8serrors.IsNotFound(err) {
			return ErrConfigMapNotFound
		}
		return err
	}

	return nil
}

func (s *ConfigMapsService) list(ctx context.Context, clusterID string) ([]ConfigMapItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotConfigMaps(ctx)
	case err != nil:
		return nil, err
	}

	list, err := clientset.CoreV1().ConfigMaps("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]ConfigMapItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapConfigMapItem(item))
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Namespace == items[j].Namespace {
			return items[i].Name < items[j].Name
		}
		return items[i].Namespace < items[j].Namespace
	})

	return items, nil
}

func (s *ConfigMapsService) snapshotConfigMaps(ctx context.Context) ([]ConfigMapItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "configmaps", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []ConfigMapItem{}, nil
	}

	var items []ConfigMapItem
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func (s *ConfigMapsService) snapshotConfigMapDetail(ctx context.Context, namespace string, name string) (json.RawMessage, error) {
	payload, err := s.ListPayload(ctx, "")
	if err != nil {
		return nil, err
	}

	item, err := findNamespacedPayload(payload, namespace, name)
	if err != nil {
		return nil, ErrConfigMapNotFound
	}

	return item, nil
}

func mapConfigMapItem(item corev1.ConfigMap) ConfigMapItem {
	return ConfigMapItem{
		ID:        fmt.Sprintf("%s/%s", item.Namespace, item.Name),
		Name:      item.Name,
		Namespace: item.Namespace,
		DataCount: len(item.Data) + len(item.BinaryData),
		Age:       formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:    copyStringMap(item.Labels),
	}
}

func mapConfigMapDetail(item corev1.ConfigMap) ConfigMapDetail {
	data := make(map[string]string, len(item.Data))
	for k, v := range item.Data {
		data[k] = v
	}

	return ConfigMapDetail{
		ConfigMapItem: mapConfigMapItem(item),
		Data:          data,
	}
}

func ConfigMapNotFoundMessage(namespace string, name string) string {
	return fmt.Sprintf("ConfigMap not found: %s/%s", namespace, name)
}
