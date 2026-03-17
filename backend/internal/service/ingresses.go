package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	networkingv1 "k8s.io/api/networking/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var (
	ErrIngressNotFound          = errors.New("ingress not found")
	ErrIngressLiveClusterNeeded = errors.New("ingress action requires a live cluster")
)

type IngressesService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type IngressItem struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Namespace      string            `json:"namespace"`
	IngressClass   string            `json:"ingressClass"`
	Rules          []IngressRule     `json:"rules"`
	TLS            []IngressTLS      `json:"tls"`
	DefaultBackend *IngressBackend   `json:"defaultBackend,omitempty"`
	Age            string            `json:"age"`
	Labels         map[string]string `json:"labels"`
}

type IngressRule struct {
	Host  string        `json:"host"`
	Paths []IngressPath `json:"paths"`
}

type IngressPath struct {
	Path        string         `json:"path"`
	PathType    string         `json:"pathType"`
	Backend     IngressBackend `json:"backend"`
}

type IngressBackend struct {
	ServiceName string `json:"serviceName"`
	ServicePort string `json:"servicePort"`
}

type IngressTLS struct {
	Hosts      []string `json:"hosts"`
	SecretName string   `json:"secretName"`
}

func NewIngressesService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *IngressesService {
	return &IngressesService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *IngressesService) ListPayload(ctx context.Context, clusterID string) (json.RawMessage, error) {
	items, err := s.list(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return json.Marshal(items)
}

func (s *IngressesService) DetailPayload(ctx context.Context, clusterID string, namespace string, name string) (json.RawMessage, error) {
	payload, err := s.ListPayload(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	return findNamespacedPayload(payload, namespace, name)
}

func (s *IngressesService) Delete(ctx context.Context, clusterID string, namespace string, name string) error {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return ErrIngressLiveClusterNeeded
	case err != nil:
		return err
	}

	if err := clientset.NetworkingV1().Ingresses(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		if k8serrors.IsNotFound(err) {
			return ErrIngressNotFound
		}
		return err
	}

	return nil
}

func (s *IngressesService) list(ctx context.Context, clusterID string) ([]IngressItem, error) {
	_, clientset, err := s.k8sManager.Client(ctx, clusterID)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		return s.snapshotIngresses(ctx)
	case err != nil:
		return nil, err
	}

	list, err := clientset.NetworkingV1().Ingresses("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	items := make([]IngressItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, mapIngress(item))
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Namespace == items[j].Namespace {
			return items[i].Name < items[j].Name
		}
		return items[i].Namespace < items[j].Namespace
	})

	return items, nil
}

func (s *IngressesService) snapshotIngresses(ctx context.Context) ([]IngressItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "ingresses", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []IngressItem{}, nil
	}

	var items []IngressItem
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, err
	}

	return items, nil
}

func mapIngress(item networkingv1.Ingress) IngressItem {
	ingressClass := ""
	if item.Spec.IngressClassName != nil {
		ingressClass = *item.Spec.IngressClassName
	}

	rules := make([]IngressRule, 0, len(item.Spec.Rules))
	for _, rule := range item.Spec.Rules {
		paths := make([]IngressPath, 0)
		if rule.HTTP != nil {
			for _, path := range rule.HTTP.Paths {
				pathType := "ImplementationSpecific"
				if path.PathType != nil {
					pathType = string(*path.PathType)
				}

				backend := IngressBackend{}
				if path.Backend.Service != nil {
					backend.ServiceName = path.Backend.Service.Name
					if path.Backend.Service.Port.Name != "" {
						backend.ServicePort = path.Backend.Service.Port.Name
					} else {
						backend.ServicePort = fmt.Sprintf("%d", path.Backend.Service.Port.Number)
					}
				}

				paths = append(paths, IngressPath{
					Path:     path.Path,
					PathType: pathType,
					Backend:  backend,
				})
			}
		}

		rules = append(rules, IngressRule{
			Host:  rule.Host,
			Paths: paths,
		})
	}

	tlsItems := make([]IngressTLS, 0, len(item.Spec.TLS))
	for _, tls := range item.Spec.TLS {
		hosts := make([]string, 0)
		if len(tls.Hosts) > 0 {
			hosts = tls.Hosts
		}
		tlsItems = append(tlsItems, IngressTLS{
			Hosts:      hosts,
			SecretName: tls.SecretName,
		})
	}

	var defaultBackend *IngressBackend
	if item.Spec.DefaultBackend != nil && item.Spec.DefaultBackend.Service != nil {
		svc := item.Spec.DefaultBackend.Service
		port := ""
		if svc.Port.Name != "" {
			port = svc.Port.Name
		} else {
			port = fmt.Sprintf("%d", svc.Port.Number)
		}
		defaultBackend = &IngressBackend{
			ServiceName: svc.Name,
			ServicePort: port,
		}
	}

	return IngressItem{
		ID:             fmt.Sprintf("%s/%s", item.Namespace, item.Name),
		Name:           item.Name,
		Namespace:      item.Namespace,
		IngressClass:   ingressClass,
		Rules:          rules,
		TLS:            tlsItems,
		DefaultBackend: defaultBackend,
		Age:            formatAge(item.CreationTimestamp.Time, timeNowUTC()),
		Labels:         copyStringMap(item.Labels),
	}
}

func IngressNotFoundMessage(namespace string, name string) string {
	return fmt.Sprintf("Ingress not found: %s/%s", namespace, name)
}
