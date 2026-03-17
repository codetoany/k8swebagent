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
	ErrServiceNotFound          = errors.New("service not found")
	ErrServiceLiveClusterNeeded = errors.New("service action requires a live cluster")
)

type ServicesService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type ServiceItem struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Type              string            `json:"type"`
	ClusterIP         string            `json:"clusterIP"`
	ExternalIPs       []string          `json:"externalIPs"`
	Ports             []ServicePort     `json:"ports"`
	Selector          map[string]string `json:"selector"`
	Age               string            `json:"age"`
	Labels            map[string]string `json:"labels"`
	SessionAffinity   string            `json:"sessionAffinity"`
	LoadBalancerIP    string            `json:"loadBalancerIP,omitempty"`
}

type ServicePort struct {
	Name       string `json:"name"`
	Protocol   string `json:"protocol"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort"`
	NodePort   int32  `json:"nodePort,omitempty"`
}

func NewServicesService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *ServicesService {
	return &ServicesService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *ServicesService) ListPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	items, err := s.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *ServicesService) DetailPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	payload, err := s.ListPayload(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return findNamespacedPayload(payload, namespace, name)
}

func (s *ServicesService) Delete(ctx context.Context, clusterID string, namespace string, name string) error {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return ErrServiceLiveClusterNeeded
	case err != nil:
		return err
	}

	if err := clientset.CoreV1().Services(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		if k8serrors.IsNotFound(err) {
			return ErrServiceNotFound
		}
		return err
	}

	return nil
}

func (s *ServicesService) list(ctx context.Context, clusterID string) ([]ServiceItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotServices(ctx)
	case err != nil:
		return nil, err
	}

	list, err := clientset.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]ServiceItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapService(item))
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Namespace == items[j].Namespace {
			return items[i].Name < items[j].Name
		}
		return items[i].Namespace < items[j].Namespace
	})

	return items, nil
}

func (s *ServicesService) snapshotServices(ctx context.Context) ([]ServiceItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "services", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []ServiceItem{}, nil
	}

	var items []ServiceItem
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func mapService(item corev1.Service) ServiceItem {
	ports := make([]ServicePort, 0, len(item.Spec.Ports))
	for _, port := range item.Spec.Ports {
		ports = append(ports, ServicePort{
			Name:       port.Name,
			Protocol:   string(port.Protocol),
			Port:       port.Port,
			TargetPort: port.TargetPort.String(),
			NodePort:   port.NodePort,
		})
	}

	externalIPs := make([]string, 0)
	if len(item.Spec.ExternalIPs) > 0 {
		externalIPs = item.Spec.ExternalIPs
	}
	for _, ingress := range item.Status.LoadBalancer.Ingress {
		if ingress.IP != "" {
			externalIPs = append(externalIPs, ingress.IP)
		} else if ingress.Hostname != "" {
			externalIPs = append(externalIPs, ingress.Hostname)
		}
	}

	loadBalancerIP := ""
	if item.Spec.Type == corev1.ServiceTypeLoadBalancer && len(item.Status.LoadBalancer.Ingress) > 0 {
		ing := item.Status.LoadBalancer.Ingress[0]
		if ing.IP != "" {
			loadBalancerIP = ing.IP
		} else {
			loadBalancerIP = ing.Hostname
		}
	}

	return ServiceItem{
		ID:              fmt.Sprintf("%s/%s", item.Namespace, item.Name),
		Name:            item.Name,
		Namespace:       item.Namespace,
		Type:            string(item.Spec.Type),
		ClusterIP:       item.Spec.ClusterIP,
		ExternalIPs:     externalIPs,
		Ports:           ports,
		Selector:        copyStringMap(item.Spec.Selector),
		Age:             formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:          copyStringMap(item.Labels),
		SessionAffinity: string(item.Spec.SessionAffinity),
		LoadBalancerIP:  loadBalancerIP,
	}
}

func ServiceNotFoundMessage(namespace string, name string) string {
	return fmt.Sprintf("Service not found: %s/%s", namespace, name)
}
