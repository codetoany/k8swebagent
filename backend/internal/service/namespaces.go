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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var ErrNamespaceNotFound = errors.New("namespace not found")

type NamespacesService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type NamespaceItem struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Status    string            `json:"status"`
	CreatedAt string            `json:"createdAt"`
	Labels    map[string]string `json:"labels"`
}

func NewNamespacesService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *NamespacesService {
	return &NamespacesService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *NamespacesService) ListPayload(ctx context.Context) (json.RawMessage, error) {
	items, err := s.list(ctx)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *NamespacesService) DetailPayload(ctx context.Context, name string) (json.RawMessage, error) {
	payload, err := s.ListPayload(ctx)
	if err != nil {
		return nil, err
	}

	var items []json.RawMessage
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	for _, item := range items {
		var meta struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(item, &meta); err != nil {
			return nil, err
		}
		if meta.Name == name {
			return item, nil
		}
	}

	return nil, ErrNamespaceNotFound
}

func (s *NamespacesService) list(ctx context.Context) ([]NamespaceItem, error) {
	_, clientset, err := s.k8sManager.DefaultClient(ctx)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotNamespaces(ctx)
	case err != nil:
		return nil, err
	}

	list, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]NamespaceItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapNamespace(item))
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})

	return items, nil
}

func (s *NamespacesService) snapshotNamespaces(ctx context.Context) ([]NamespaceItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "namespaces", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []NamespaceItem{}, nil
	}

	var items []NamespaceItem
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func mapNamespace(item corev1.Namespace) NamespaceItem {
	return NamespaceItem{
		ID:        item.Name,
		Name:      item.Name,
		Status:    string(item.Status.Phase),
		CreatedAt: item.CreationTimestamp.Time.Format("2006-01-02"),
		Labels:    copyStringMap(item.Labels),
	}
}

func NamespaceNotFoundMessage(name string) string {
	return fmt.Sprintf("Namespace not found: %s", name)
}
