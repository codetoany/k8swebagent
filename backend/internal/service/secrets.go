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

var ErrSecretNotFound = errors.New("secret not found")

type SecretsService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type SecretItem struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Type      string            `json:"type"`
	DataCount int               `json:"dataCount"`
	Age       string            `json:"age"`
	Labels    map[string]string `json:"labels"`
}

type SecretDetail struct {
	SecretItem
	DataKeys []string `json:"dataKeys"`
}

func NewSecretsService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *SecretsService {
	return &SecretsService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *SecretsService) ListPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	items, err := s.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *SecretsService) DetailPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		payload, listErr := s.ListPayload(ctx, "")
		if listErr != nil {
			return nil, listErr
		}
		item, findErr := findNamespacedPayload(payload, namespace, name)
		if findErr != nil {
			return nil, ErrSecretNotFound
		}
		return item, nil
	case err != nil:
		return nil, err
	}

	item, err := clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, ErrSecretNotFound
	}

	return json.Marshal(mapSecretDetail(*item))
}

func (s *SecretsService) list(ctx context.Context, clusterID string) ([]SecretItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotSecrets(ctx)
	case err != nil:
		return nil, err
	}

	list, err := clientset.CoreV1().Secrets("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]SecretItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapSecretItem(item))
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Namespace == items[j].Namespace {
			return items[i].Name < items[j].Name
		}
		return items[i].Namespace < items[j].Namespace
	})

	return items, nil
}

func (s *SecretsService) snapshotSecrets(ctx context.Context) ([]SecretItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "secrets", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []SecretItem{}, nil
	}

	var items []SecretItem
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func mapSecretItem(item corev1.Secret) SecretItem {
	return SecretItem{
		ID:        fmt.Sprintf("%s/%s", item.Namespace, item.Name),
		Name:      item.Name,
		Namespace: item.Namespace,
		Type:      string(item.Type),
		DataCount: len(item.Data),
		Age:       formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:    copyStringMap(item.Labels),
	}
}

func mapSecretDetail(item corev1.Secret) SecretDetail {
	keys := make([]string, 0, len(item.Data))
	for k := range item.Data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	return SecretDetail{
		SecretItem: mapSecretItem(item),
		DataKeys:   keys,
	}
}

func SecretNotFoundMessage(namespace string, name string) string {
	return fmt.Sprintf("Secret not found: %s/%s", namespace, name)
}
