package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"k8s-agent-backend/internal/k8s"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/yaml"
)

var (
	ErrYAMLInvalidKind = errors.New("invalid or unsupported resource kind")
)

type YAMLService struct {
	k8sManager *k8s.Manager
}

type YAMLResponse struct {
	YAML string `json:"yaml"`
}

func NewYAMLService(k8sManager *k8s.Manager) *YAMLService {
	return &YAMLService{
		k8sManager: k8sManager,
	}
}

func (s *YAMLService) GetResourceYAML(
	ctx context.Context,
	clusterID string,
	kind string,
	version string,
	namespace string,
	name string,
) (json.RawMessage, error) {
	if kind == "" || version == "" || name == "" {
		return nil, errors.New("kind, version, and name are required")
	}

	_, dynClient, err := s.k8sManager.DynamicClient(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	// 简单的 GroupVersionResource 映射（实际应用中可能需要 DiscoveryClient 动态获取）
	// 这里为了简化，我们根据常见的 kind 映射到相应的 GVR，如果需要支持 CRD 应当从前端传 group
	gvr := getGVRFromKind(kind, version)
	if gvr.Resource == "" {
		return nil, fmt.Errorf("%w: %s/%s", ErrYAMLInvalidKind, version, kind)
	}

	var unstr *unstructured.Unstructured
	if namespace != "" {
		unstr, err = dynClient.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	} else {
		unstr, err = dynClient.Resource(gvr).Get(ctx, name, metav1.GetOptions{})
	}

	if err != nil {
		return nil, err
	}

	// Remove managed fields for cleaner YAML
	unstructured.RemoveNestedField(unstr.Object, "metadata", "managedFields")

	yamlBytes, err := yaml.Marshal(unstr.Object)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal to yaml: %w", err)
	}

	resp := YAMLResponse{
		YAML: string(yamlBytes),
	}

	return json.Marshal(resp)
}

func getGVRFromKind(kind, version string) schema.GroupVersionResource {
	// A basic mapping table. A production-ready solution would use an API discovery approach.
	var group, resource string

	switch kind {
	case "Pod":
		group = ""
		resource = "pods"
	case "Service":
		group = ""
		resource = "services"
	case "ConfigMap":
		group = ""
		resource = "configmaps"
	case "Secret":
		group = ""
		resource = "secrets"
	case "Namespace":
		group = ""
		resource = "namespaces"
	case "Node":
		group = ""
		resource = "nodes"
	case "PersistentVolume":
		group = ""
		resource = "persistentvolumes"
	case "PersistentVolumeClaim":
		group = ""
		resource = "persistentvolumeclaims"
	case "Event":
		group = ""
		resource = "events"
	case "ServiceAccount":
		group = ""
		resource = "serviceaccounts"
	case "Deployment":
		group = "apps"
		resource = "deployments"
	case "StatefulSet":
		group = "apps"
		resource = "statefulsets"
	case "DaemonSet":
		group = "apps"
		resource = "daemonsets"
	case "ReplicaSet":
		group = "apps"
		resource = "replicasets"
	case "Job":
		group = "batch"
		resource = "jobs"
	case "CronJob":
		group = "batch"
		resource = "cronjobs"
	case "Ingress":
		group = "networking.k8s.io"
		resource = "ingresses"
	case "NetworkPolicy":
		group = "networking.k8s.io"
		resource = "networkpolicies"
	case "StorageClass":
		group = "storage.k8s.io"
		resource = "storageclasses"
	case "Role":
		group = "rbac.authorization.k8s.io"
		resource = "roles"
	case "ClusterRole":
		group = "rbac.authorization.k8s.io"
		resource = "clusterroles"
	case "RoleBinding":
		group = "rbac.authorization.k8s.io"
		resource = "rolebindings"
	case "ClusterRoleBinding":
		group = "rbac.authorization.k8s.io"
		resource = "clusterrolebindings"
	}

	// Some apiVersions come nicely as Group/Version for CRDs
	// E.g. apps/v1, networking.k8s.io/v1
	// We handle standard ones explicitly above, but you could extract group from version if kind match isn't perfect.

	return schema.GroupVersionResource{
		Group:    group,
		Version:  version, // Expecting "v1", "v1beta1" instead of "apps/v1" if parsing logic gets complex, but let's stick to standard v1 etc first.
		Resource: resource,
	}
}
