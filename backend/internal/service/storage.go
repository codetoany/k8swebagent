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
	storagev1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var (
	ErrPVCNotFound          = errors.New("pvc not found")
	ErrPVNotFound           = errors.New("pv not found")
	ErrStorageClassNotFound = errors.New("storageclass not found")
)

type StorageService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type PVCItem struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Status           string            `json:"status"`
	Volume           string            `json:"volume"`
	Capacity         string            `json:"capacity"`
	AccessModes      []string          `json:"accessModes"`
	StorageClassName string            `json:"storageClassName"`
	Age              string            `json:"age"`
	Labels           map[string]string `json:"labels"`
}

type PVItem struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Status           string            `json:"status"`
	Capacity         string            `json:"capacity"`
	AccessModes      []string          `json:"accessModes"`
	ReclaimPolicy    string            `json:"reclaimPolicy"`
	StorageClassName string            `json:"storageClassName"`
	Claim            string            `json:"claim"`
	Age              string            `json:"age"`
	Labels           map[string]string `json:"labels"`
}

type StorageClassItem struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Provisioner   string            `json:"provisioner"`
	ReclaimPolicy string            `json:"reclaimPolicy"`
	VolumeBinding string            `json:"volumeBindingMode"`
	IsDefault     bool              `json:"isDefault"`
	Age           string            `json:"age"`
	Labels        map[string]string `json:"labels"`
}

func NewStorageService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *StorageService {
	return &StorageService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *StorageService) ListPVCPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return json.Marshal([]PVCItem{})
	case err != nil:
		return nil, err
	}

	list, err := clientset.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]PVCItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapPVC(item))
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Namespace == items[j].Namespace {
			return items[i].Name < items[j].Name
		}
		return items[i].Namespace < items[j].Namespace
	})

	return json.Marshal(items)
}

func (s *StorageService) PVCDetailPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	payload, err := s.ListPVCPayload(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	item, err := findNamespacedPayload(payload, namespace, name)
	if err != nil {
		return nil, ErrPVCNotFound
	}

	return item, nil
}

func (s *StorageService) ListPVPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return json.Marshal([]PVItem{})
	case err != nil:
		return nil, err
	}

	list, err := clientset.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]PVItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapPV(item))
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})

	return json.Marshal(items)
}

func (s *StorageService) PVDetailPayload(ctx context.Context, clusterID string, name string) (json.RawMessage, error) {
	payload, err := s.ListPVPayload(ctx, clusterID)
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

	return nil, ErrPVNotFound
}

func (s *StorageService) ListStorageClassPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return json.Marshal([]StorageClassItem{})
	case err != nil:
		return nil, err
	}

	list, err := clientset.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]StorageClassItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapStorageClass(item))
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})

	return json.Marshal(items)
}

func (s *StorageService) StorageClassDetailPayload(ctx context.Context, clusterID string, name string) (json.RawMessage, error) {
	payload, err := s.ListStorageClassPayload(ctx, clusterID)
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

	return nil, ErrStorageClassNotFound
}

func mapPVC(item corev1.PersistentVolumeClaim) PVCItem {
	accessModes := make([]string, 0, len(item.Spec.AccessModes))
	for _, mode := range item.Spec.AccessModes {
		accessModes = append(accessModes, string(mode))
	}

	capacity := ""
	if storage, ok := item.Status.Capacity[corev1.ResourceStorage]; ok {
		capacity = storage.String()
	} else if req := item.Spec.Resources.Requests; req != nil {
		if storage, ok := req[corev1.ResourceStorage]; ok {
			capacity = storage.String()
		}
	}

	storageClassName := ""
	if item.Spec.StorageClassName != nil {
		storageClassName = *item.Spec.StorageClassName
	}

	return PVCItem{
		ID:               fmt.Sprintf("%s/%s", item.Namespace, item.Name),
		Name:             item.Name,
		Namespace:        item.Namespace,
		Status:           string(item.Status.Phase),
		Volume:           item.Spec.VolumeName,
		Capacity:         capacity,
		AccessModes:      accessModes,
		StorageClassName: storageClassName,
		Age:              formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:           copyStringMap(item.Labels),
	}
}

func mapPV(item corev1.PersistentVolume) PVItem {
	accessModes := make([]string, 0, len(item.Spec.AccessModes))
	for _, mode := range item.Spec.AccessModes {
		accessModes = append(accessModes, string(mode))
	}

	capacity := ""
	if storage, ok := item.Spec.Capacity[corev1.ResourceStorage]; ok {
		capacity = storage.String()
	}

	reclaimPolicy := ""
	if item.Spec.PersistentVolumeReclaimPolicy != "" {
		reclaimPolicy = string(item.Spec.PersistentVolumeReclaimPolicy)
	}

	storageClassName := item.Spec.StorageClassName

	claim := ""
	if item.Spec.ClaimRef != nil {
		claim = fmt.Sprintf("%s/%s", item.Spec.ClaimRef.Namespace, item.Spec.ClaimRef.Name)
	}

	return PVItem{
		ID:               item.Name,
		Name:             item.Name,
		Status:           string(item.Status.Phase),
		Capacity:         capacity,
		AccessModes:      accessModes,
		ReclaimPolicy:    reclaimPolicy,
		StorageClassName: storageClassName,
		Claim:            claim,
		Age:              formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:           copyStringMap(item.Labels),
	}
}

func mapStorageClass(item storagev1.StorageClass) StorageClassItem {
	reclaimPolicy := ""
	if item.ReclaimPolicy != nil {
		reclaimPolicy = string(*item.ReclaimPolicy)
	}

	volumeBinding := ""
	if item.VolumeBindingMode != nil {
		volumeBinding = string(*item.VolumeBindingMode)
	}

	isDefault := false
	if v, ok := item.Annotations["storageclass.kubernetes.io/is-default-class"]; ok && v == "true" {
		isDefault = true
	}

	return StorageClassItem{
		ID:            item.Name,
		Name:          item.Name,
		Provisioner:   item.Provisioner,
		ReclaimPolicy: reclaimPolicy,
		VolumeBinding: volumeBinding,
		IsDefault:     isDefault,
		Age:           formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:        copyStringMap(item.Labels),
	}
}
