package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"k8s-agent-backend/internal/k8s"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8syaml "sigs.k8s.io/yaml"
)

// ApplyService 处理通过 YAML 创建/更新 K8s 资源
type ApplyService struct {
	k8sManager *k8s.Manager
}

// ApplyResult 描述 apply 操作结果
type ApplyResult struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Action    string `json:"action"` // "created" | "updated"
}

func NewApplyService(k8sManager *k8s.Manager) *ApplyService {
	return &ApplyService{k8sManager: k8sManager}
}

// ApplyYAML 解析 YAML 并创建或替换对应资源
func (s *ApplyService) ApplyYAML(ctx context.Context, clusterID string, yamlContent string) (json.RawMessage, error) {
	_, dynClient, err := s.k8sManager.DynamicClient(ctx, clusterID)
	if err != nil {
		return nil, err
	}

	// 解析 YAML → JSON → Unstructured
	jsonBytes, err := k8syaml.YAMLToJSON([]byte(yamlContent))
	if err != nil {
		return nil, fmt.Errorf("YAML 解析失败: %w", err)
	}

	obj := &unstructured.Unstructured{}
	if err := obj.UnmarshalJSON(jsonBytes); err != nil {
		return nil, fmt.Errorf("资源格式无效: %w", err)
	}

	gvk := obj.GroupVersionKind()
	if gvk.Kind == "" {
		return nil, errors.New("YAML 缺少 kind 字段")
	}
	if obj.GetName() == "" {
		return nil, errors.New("YAML 缺少 metadata.name 字段")
	}

	gvr, namespaced := gvrFromGVK(gvk)
	if gvr.Resource == "" {
		return nil, fmt.Errorf("不支持的资源类型: %s", gvk.Kind)
	}

	namespace := obj.GetNamespace()
	action := "created"

	var result *unstructured.Unstructured
	if namespaced {
		if namespace == "" {
			namespace = "default"
			obj.SetNamespace(namespace)
		}
		ri := dynClient.Resource(gvr).Namespace(namespace)
		_, getErr := ri.Get(ctx, obj.GetName(), metav1.GetOptions{})
		if getErr == nil {
			// 资源已存在，使用 Update（replace）
			result, err = ri.Update(ctx, obj, metav1.UpdateOptions{})
			action = "updated"
		} else {
			result, err = ri.Create(ctx, obj, metav1.CreateOptions{})
		}
	} else {
		ri := dynClient.Resource(gvr)
		_, getErr := ri.Get(ctx, obj.GetName(), metav1.GetOptions{})
		if getErr == nil {
			result, err = ri.Update(ctx, obj, metav1.UpdateOptions{})
			action = "updated"
		} else {
			result, err = ri.Create(ctx, obj, metav1.CreateOptions{})
		}
	}
	if err != nil {
		return nil, err
	}

	return json.Marshal(ApplyResult{
		Kind:      result.GetKind(),
		Name:      result.GetName(),
		Namespace: result.GetNamespace(),
		Action:    action,
	})
}

// gvrFromGVK 将 GVK 转换为 GVR，并返回是否命名空间级资源
func gvrFromGVK(gvk schema.GroupVersionKind) (schema.GroupVersionResource, bool) {
	kind := gvk.Kind
	group := gvk.Group
	version := gvk.Version
	if version == "" {
		version = "v1"
	}

	// 将 "apps/v1" 这种 apiVersion 中的 group 提取
	// gvk.Group 在正确解析时已经包含了 group
	_ = group

	pluralKind := kindToResource(kind)
	if pluralKind == "" {
		return schema.GroupVersionResource{}, false
	}

	namespaced := isNamespaced(kind)

	return schema.GroupVersionResource{
		Group:    gvkGroup(kind, group),
		Version:  version,
		Resource: pluralKind,
	}, namespaced
}

func kindToResource(kind string) string {
	// 简单复数化转换表
	m := map[string]string{
		"Pod": "pods", "Service": "services", "ConfigMap": "configmaps",
		"Secret": "secrets", "Namespace": "namespaces", "Node": "nodes",
		"PersistentVolume": "persistentvolumes", "PersistentVolumeClaim": "persistentvolumeclaims",
		"ServiceAccount": "serviceaccounts", "Event": "events",
		"Deployment": "deployments", "StatefulSet": "statefulsets",
		"DaemonSet": "daemonsets", "ReplicaSet": "replicasets",
		"Job": "jobs", "CronJob": "cronjobs",
		"Ingress": "ingresses", "NetworkPolicy": "networkpolicies",
		"StorageClass": "storageclasses",
		"Role": "roles", "ClusterRole": "clusterroles",
		"RoleBinding": "rolebindings", "ClusterRoleBinding": "clusterrolebindings",
		"HorizontalPodAutoscaler": "horizontalpodautoscalers",
		"LimitRange": "limitranges", "ResourceQuota": "resourcequotas",
	}
	return m[kind]
}

func isNamespaced(kind string) bool {
	clusterScoped := map[string]bool{
		"Node": true, "Namespace": true, "PersistentVolume": true,
		"ClusterRole": true, "ClusterRoleBinding": true, "StorageClass": true,
	}
	return !clusterScoped[kind]
}

func gvkGroup(kind, fallbackGroup string) string {
	groups := map[string]string{
		"Deployment": "apps", "StatefulSet": "apps", "DaemonSet": "apps",
		"ReplicaSet": "apps", "Job": "batch", "CronJob": "batch",
		"Ingress": "networking.k8s.io", "NetworkPolicy": "networking.k8s.io",
		"StorageClass": "storage.k8s.io",
		"Role": "rbac.authorization.k8s.io", "ClusterRole": "rbac.authorization.k8s.io",
		"RoleBinding": "rbac.authorization.k8s.io", "ClusterRoleBinding": "rbac.authorization.k8s.io",
		"HorizontalPodAutoscaler": "autoscaling",
	}
	if g, ok := groups[kind]; ok {
		return g
	}
	if strings.TrimSpace(fallbackGroup) != "" {
		return fallbackGroup
	}
	return "" // core group
}
