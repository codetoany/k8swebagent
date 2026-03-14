package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var ErrNodeNotFound = errors.New("node not found")

type NodesService struct {
	snapshotStore *store.SnapshotStore
	k8sManager    *k8s.Manager
}

type NodeListItem struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Status         string            `json:"status"`
	CPUUsage       int               `json:"cpuUsage"`
	MemoryUsage    int               `json:"memoryUsage"`
	Pods           int               `json:"pods"`
	IP             string            `json:"ip"`
	OS             string            `json:"os"`
	KernelVersion  string            `json:"kernelVersion"`
	KubeletVersion string            `json:"kubeletVersion"`
	Capacity       NodeResourceMap   `json:"capacity"`
	Allocatable    NodeResourceMap   `json:"allocatable"`
	Labels         map[string]string `json:"labels"`
	Taints         []NodeTaint       `json:"taints"`
}

type NodeResourceMap struct {
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
	Pods   string `json:"pods"`
}

type NodeTaint struct {
	Key    string `json:"key"`
	Value  string `json:"value,omitempty"`
	Effect string `json:"effect"`
}

type NodeMetrics struct {
	CPUUsage        int       `json:"cpuUsage"`
	MemoryUsage     int       `json:"memoryUsage"`
	DiskUsage       int       `json:"diskUsage"`
	NetworkReceive  int       `json:"networkReceive"`
	NetworkTransmit int       `json:"networkTransmit"`
	Timestamp       time.Time `json:"timestamp"`
}

func NewNodesService(snapshotStore *store.SnapshotStore, k8sManager *k8s.Manager) *NodesService {
	return &NodesService{
		snapshotStore: snapshotStore,
		k8sManager:    k8sManager,
	}
}

func (s *NodesService) ListPayload(ctx context.Context) (json.RawMessage, error) {
	nodes, err := s.list(ctx)
	if err != nil {
		return nil, err
	}

	return json.Marshal(nodes)
}

func (s *NodesService) MetricsPayload(ctx context.Context, name string) (json.RawMessage, error) {
	nodes, source, err := s.listWithSource(ctx)
	if err != nil {
		return nil, err
	}

	if source == "snapshot" {
		return s.snapshotMetricsPayload(ctx, name)
	}

	for _, node := range nodes {
		if node.Name == name {
			return json.Marshal(NodeMetrics{
				CPUUsage:        node.CPUUsage,
				MemoryUsage:     node.MemoryUsage,
				DiskUsage:       0,
				NetworkReceive:  0,
				NetworkTransmit: 0,
				Timestamp:       time.Now().UTC(),
			})
		}
	}

	return nil, ErrNodeNotFound
}

func (s *NodesService) list(ctx context.Context) ([]NodeListItem, error) {
	nodes, _, err := s.listWithSource(ctx)
	return nodes, err
}

func (s *NodesService) listWithSource(ctx context.Context) ([]NodeListItem, string, error) {
	_, clientset, err := s.k8sManager.DefaultClient(ctx)
	switch {
	case errors.Is(err, k8s.ErrClusterNotConfigured), errors.Is(err, k8s.ErrClusterDisabled):
		nodes, err := s.snapshotNodes(ctx)
		return nodes, "snapshot", err
	case err != nil:
		return nil, "", err
	}

	nodeList, err := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, "", err
	}

	podList, podErr := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	podsByNode := make(map[string][]corev1.Pod)
	if podErr == nil {
		for _, pod := range podList.Items {
			if pod.Spec.NodeName == "" || isTerminalPod(pod) {
				continue
			}
			podsByNode[pod.Spec.NodeName] = append(podsByNode[pod.Spec.NodeName], pod)
		}
	}

	nodes := make([]NodeListItem, 0, len(nodeList.Items))
	for _, node := range nodeList.Items {
		nodes = append(nodes, mapNode(node, podsByNode[node.Name]))
	}

	return nodes, "k8s", nil
}

func (s *NodesService) snapshotNodes(ctx context.Context) ([]NodeListItem, error) {
	payload, err := s.snapshotStore.Get(ctx, "nodes", "list")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return []NodeListItem{}, nil
	}

	var nodes []NodeListItem
	if err := json.Unmarshal(payload, &nodes); err != nil {
		return nil, err
	}

	return nodes, nil
}

func (s *NodesService) snapshotMetricsPayload(ctx context.Context, name string) (json.RawMessage, error) {
	payload, err := s.snapshotStore.Get(ctx, "nodes", "metrics")
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, ErrNodeNotFound
	}

	var metrics map[string]json.RawMessage
	if err := json.Unmarshal(payload, &metrics); err != nil {
		return nil, err
	}

	entry, found := metrics[name]
	if !found {
		return nil, ErrNodeNotFound
	}

	return entry, nil
}

func mapNode(node corev1.Node, pods []corev1.Pod) NodeListItem {
	allocCPU := node.Status.Allocatable.Cpu()
	allocMemory := node.Status.Allocatable.Memory()
	usedCPU := resource.NewMilliQuantity(0, resource.DecimalSI)
	usedMemory := resource.NewQuantity(0, resource.BinarySI)

	for _, pod := range pods {
		podCPU, podMemory := requestedResources(pod)
		usedCPU.Add(*podCPU)
		usedMemory.Add(*podMemory)
	}

	return NodeListItem{
		ID:             node.Name,
		Name:           node.Name,
		Status:         nodeStatus(node),
		CPUUsage:       percentage(usedCPU.MilliValue(), allocCPU.MilliValue()),
		MemoryUsage:    percentage(usedMemory.Value(), allocMemory.Value()),
		Pods:           len(pods),
		IP:             nodeAddress(node),
		OS:             node.Status.NodeInfo.OSImage,
		KernelVersion:  node.Status.NodeInfo.KernelVersion,
		KubeletVersion: node.Status.NodeInfo.KubeletVersion,
		Capacity: NodeResourceMap{
			CPU:    formatCPU(node.Status.Capacity.Cpu()),
			Memory: formatMemory(node.Status.Capacity.Memory()),
			Pods:   node.Status.Capacity.Pods().String(),
		},
		Allocatable: NodeResourceMap{
			CPU:    formatCPU(node.Status.Allocatable.Cpu()),
			Memory: formatMemory(node.Status.Allocatable.Memory()),
			Pods:   node.Status.Allocatable.Pods().String(),
		},
		Labels: copyStringMap(node.Labels),
		Taints: mapTaints(node.Spec.Taints),
	}
}

func requestedResources(pod corev1.Pod) (*resource.Quantity, *resource.Quantity) {
	cpu := resource.NewMilliQuantity(0, resource.DecimalSI)
	memory := resource.NewQuantity(0, resource.BinarySI)

	for _, container := range pod.Spec.Containers {
		if request, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
			cpu.Add(request)
		}
		if request, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
			memory.Add(request)
		}
	}

	return cpu, memory
}

func percentage(used int64, total int64) int {
	if total <= 0 || used <= 0 {
		return 0
	}

	value := int(math.Round((float64(used) / float64(total)) * 100))
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func formatCPU(quantity *resource.Quantity) string {
	if quantity == nil {
		return "0"
	}

	milli := quantity.MilliValue()
	if milli%1000 == 0 {
		return strconv.FormatInt(milli/1000, 10)
	}

	value := float64(milli) / 1000
	text := strconv.FormatFloat(value, 'f', 2, 64)
	text = strings.TrimRight(text, "0")
	text = strings.TrimRight(text, ".")
	return text
}

func formatMemory(quantity *resource.Quantity) string {
	if quantity == nil {
		return "0"
	}

	return quantity.String()
}

func nodeStatus(node corev1.Node) string {
	for _, condition := range node.Status.Conditions {
		if condition.Type == corev1.NodeReady {
			if condition.Status == corev1.ConditionTrue {
				return "online"
			}
			return "offline"
		}
	}

	return "offline"
}

func nodeAddress(node corev1.Node) string {
	for _, address := range node.Status.Addresses {
		if address.Type == corev1.NodeInternalIP {
			return address.Address
		}
	}
	for _, address := range node.Status.Addresses {
		if address.Type == corev1.NodeExternalIP {
			return address.Address
		}
	}

	return ""
}

func mapTaints(taints []corev1.Taint) []NodeTaint {
	if len(taints) == 0 {
		return []NodeTaint{}
	}

	values := make([]NodeTaint, 0, len(taints))
	for _, taint := range taints {
		values = append(values, NodeTaint{
			Key:    taint.Key,
			Value:  taint.Value,
			Effect: string(taint.Effect),
		})
	}

	return values
}

func copyStringMap(source map[string]string) map[string]string {
	if len(source) == 0 {
		return map[string]string{}
	}

	target := make(map[string]string, len(source))
	for key, value := range source {
		target[key] = value
	}

	return target
}

func isTerminalPod(pod corev1.Pod) bool {
	switch pod.Status.Phase {
	case corev1.PodSucceeded, corev1.PodFailed:
		return true
	default:
		return false
	}
}

func FindNodePayload(payload json.RawMessage, name string) (json.RawMessage, error) {
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

	return nil, ErrNodeNotFound
}

func NodeNotFoundMessage(name string) string {
	return fmt.Sprintf("Node not found: %s", name)
}
