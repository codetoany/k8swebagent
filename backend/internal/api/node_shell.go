package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

var (
	errNodeShellDisabled         = errors.New("node shell is disabled")
	errNodeShellAdminOnly        = errors.New("node shell is restricted to administrators")
	errHostShellDaemonSetMissing = errors.New("host-shell daemonset is not deployed")
	errHostShellPodUnavailable   = errors.New("host-shell pod is not available on the target node")
)

type nodeShellMetaResponse struct {
	Enabled               bool   `json:"enabled"`
	AdminOnly             bool   `json:"adminOnly"`
	SessionTimeoutSeconds int    `json:"sessionTimeoutSeconds"`
	Namespace             string `json:"namespace"`
	DaemonSetName         string `json:"daemonSetName"`
	PodLabelSelector      string `json:"podLabelSelector"`
	ContainerName         string `json:"containerName"`
	ShellPath             string `json:"shellPath"`
	CommandPreview        string `json:"commandPreview"`
	Installed             bool   `json:"installed"`
	DesiredPods           int    `json:"desiredPods"`
	ReadyPods             int    `json:"readyPods"`
	AvailablePods         int    `json:"availablePods"`
	Message               string `json:"message,omitempty"`
}

type nodeShellRuntimeStatus struct {
	Installed     bool
	DesiredPods   int
	ReadyPods     int
	AvailablePods int
	Message       string
}

type nodeShellSession struct {
	cluster      *store.Cluster
	clusterID    string
	nodeName     string
	podNamespace string
	podName      string
	container    string
	command      []string
	execSession  *execSession
}

func (h *handler) nodeShellMeta(w http.ResponseWriter, r *http.Request) error {
	if err := requireNodeShellAccess(r.Context()); err != nil {
		return err
	}

	response := nodeShellMetaResponse{
		Enabled:               h.hostShellCfg.Enabled,
		AdminOnly:             true,
		SessionTimeoutSeconds: h.hostShellCfg.SessionTimeoutSeconds,
		Namespace:             h.hostShellCfg.Namespace,
		DaemonSetName:         h.hostShellCfg.DaemonSetName,
		PodLabelSelector:      h.hostShellCfg.PodLabelSelector,
		ContainerName:         h.hostShellCfg.ContainerName,
		ShellPath:             h.hostShellCfg.ShellPath,
		CommandPreview:        h.hostShellCfg.EnterCommand,
	}

	if !h.hostShellCfg.Enabled {
		response.Message = "节点终端未启用，请先在后端配置中显式开启"
		writeJSON(w, http.StatusOK, response)
		return nil
	}

	status, err := h.inspectNodeShellRuntime(r.Context(), requestedClusterID(r))
	if err != nil {
		response.Message = errorMessageForAudit(err)
		writeJSON(w, http.StatusOK, response)
		return nil
	}

	response.Installed = status.Installed
	response.DesiredPods = status.DesiredPods
	response.ReadyPods = status.ReadyPods
	response.AvailablePods = status.AvailablePods
	response.Message = status.Message
	writeJSON(w, http.StatusOK, response)
	return nil
}

func (h *handler) nodeShellWS(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "name")
	clusterID := requestedClusterID(r)
	cols, rows := requestedTerminalSize(r)

	if err := requireNodeShellAccess(r.Context()); err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "node.shell",
			ResourceType: "node",
			ResourceName: nodeName,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      "节点终端会话建立失败: " + errorMessageForAudit(err),
		})
		writeNodeShellHandshakeError(w, err)
		return
	}

	if !h.hostShellCfg.Enabled {
		err := errNodeShellDisabled
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "node.shell",
			ResourceType: "node",
			ResourceName: nodeName,
			Namespace:    h.hostShellCfg.Namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      "节点终端未启用",
		})
		writeNodeShellHandshakeError(w, err)
		return
	}

	session, err := h.prepareNodeShellSession(r.Context(), clusterID, nodeName)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "node.shell",
			ResourceType: "node",
			ResourceName: nodeName,
			Namespace:    h.hostShellCfg.Namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      "节点终端会话建立失败: " + errorMessageForAudit(err),
			Details: map[string]any{
				"transport": "websocket",
				"nodeName":  nodeName,
				"error":     errorMessageForAudit(err),
			},
		})
		writeNodeShellHandshakeError(w, err)
		return
	}

	conn, err := execUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	result, execErr := executeTerminalSession(r.Context(), session.execSession, conn, cols, rows)
	status := store.AuditStatusSuccess
	message := "节点终端会话已结束"
	if execErr != nil && !isNormalExecSocketClose(execErr) {
		status = store.AuditStatusFailed
		message = "节点终端会话异常结束: " + errorMessageForAudit(execErr)
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "node.shell",
		ResourceType: "node",
		ResourceName: nodeName,
		Namespace:    session.podNamespace,
		ClusterID:    session.clusterID,
		Status:       status,
		Message:      message,
		Details: map[string]any{
			"transport":    "websocket",
			"nodeName":     session.nodeName,
			"hostShellPod": session.podName,
			"container":    result.Container,
			"command":      session.command,
			"exitCode":     result.ExitCode,
			"closeReason":  result.CloseReason,
		},
	})
}

func (h *handler) inspectNodeShellRuntime(ctx context.Context, clusterID string) (nodeShellRuntimeStatus, error) {
	status := nodeShellRuntimeStatus{}

	_, clientset, err := h.k8sManager.Client(ctx, clusterID)
	if err != nil {
		return status, err
	}

	daemonSet, err := clientset.AppsV1().DaemonSets(h.hostShellCfg.Namespace).Get(ctx, h.hostShellCfg.DaemonSetName, metav1.GetOptions{})
	if k8serrors.IsNotFound(err) {
		status.Message = fmt.Sprintf("未检测到节点终端 DaemonSet：%s/%s", h.hostShellCfg.Namespace, h.hostShellCfg.DaemonSetName)
		return status, nil
	}
	if err != nil {
		return status, err
	}

	status.Installed = true
	status.DesiredPods = int(daemonSet.Status.DesiredNumberScheduled)
	status.ReadyPods = int(daemonSet.Status.NumberReady)
	status.AvailablePods = int(daemonSet.Status.NumberAvailable)

	switch {
	case status.ReadyPods <= 0:
		status.Message = "节点终端 DaemonSet 已部署，但暂无 Ready Pod"
	case status.DesiredPods > status.ReadyPods:
		status.Message = fmt.Sprintf("节点终端 DaemonSet 已部署，当前 %d/%d 个节点 Pod Ready", status.ReadyPods, status.DesiredPods)
	}

	return status, nil
}

func (h *handler) prepareNodeShellSession(ctx context.Context, clusterID, nodeName string) (*nodeShellSession, error) {
	nodeName = strings.TrimSpace(nodeName)
	if nodeName == "" {
		return nil, newHTTPError(http.StatusBadRequest, "节点名称不能为空")
	}

	cluster, clientset, err := h.k8sManager.Client(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if cluster == nil {
		return nil, k8s.ErrClusterNotFound
	}

	if _, err := clientset.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{}); err != nil {
		return nil, err
	}

	hostShellPod, err := h.findHostShellPodForNode(ctx, clientset, nodeName)
	if err != nil {
		return nil, err
	}

	containerName := strings.TrimSpace(h.hostShellCfg.ContainerName)
	if containerName == "" && len(hostShellPod.Spec.Containers) > 0 {
		containerName = hostShellPod.Spec.Containers[0].Name
	}
	if containerName == "" {
		return nil, errors.New("host-shell pod has no available container")
	}

	command := requestedNodeShellCommand(h.hostShellCfg.ShellPath, h.hostShellCfg.EnterCommand)
	execSession, err := prepareExecSession(
		ctx,
		h.k8sManager,
		cluster.ID,
		hostShellPod.Namespace,
		hostShellPod.Name,
		containerName,
		command,
	)
	if err != nil {
		return nil, err
	}

	return &nodeShellSession{
		cluster:      cluster,
		clusterID:    cluster.ID,
		nodeName:     nodeName,
		podNamespace: hostShellPod.Namespace,
		podName:      hostShellPod.Name,
		container:    containerName,
		command:      command,
		execSession:  execSession,
	}, nil
}

func (h *handler) findHostShellPodForNode(ctx context.Context, clientset kubernetes.Interface, nodeName string) (*corev1.Pod, error) {
	if _, err := clientset.AppsV1().DaemonSets(h.hostShellCfg.Namespace).Get(ctx, h.hostShellCfg.DaemonSetName, metav1.GetOptions{}); err != nil {
		if k8serrors.IsNotFound(err) {
			return nil, errHostShellDaemonSetMissing
		}
		return nil, err
	}

	podList, err := clientset.CoreV1().Pods(h.hostShellCfg.Namespace).List(ctx, metav1.ListOptions{
		LabelSelector: h.hostShellCfg.PodLabelSelector,
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", nodeName),
	})
	if err != nil {
		return nil, err
	}

	hostShellPod := pickPreferredHostShellPod(podList.Items)
	if hostShellPod == nil {
		return nil, errHostShellPodUnavailable
	}
	if hostShellPod.Status.Phase != corev1.PodRunning {
		return nil, fmt.Errorf("host-shell pod %s is %s", hostShellPod.Name, strings.ToLower(string(hostShellPod.Status.Phase)))
	}
	if !isHostShellPodReady(*hostShellPod) {
		return nil, fmt.Errorf("host-shell pod %s is not ready", hostShellPod.Name)
	}

	return hostShellPod, nil
}

func requestedNodeShellCommand(shellPath, enterCommand string) []string {
	shellPath = strings.TrimSpace(shellPath)
	if shellPath == "" {
		shellPath = "/bin/sh"
	}

	enterCommand = strings.TrimSpace(enterCommand)
	if enterCommand == "" {
		return []string{shellPath}
	}

	return []string{shellPath, "-lc", enterCommand}
}

func pickPreferredHostShellPod(pods []corev1.Pod) *corev1.Pod {
	if len(pods) == 0 {
		return nil
	}

	sort.SliceStable(pods, func(i, j int) bool {
		leftRank := hostShellPodRank(pods[i])
		rightRank := hostShellPodRank(pods[j])
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		return pods[i].Name < pods[j].Name
	})

	selected := pods[0]
	return &selected
}

func hostShellPodRank(pod corev1.Pod) int {
	switch {
	case pod.DeletionTimestamp != nil:
		return 5
	case pod.Status.Phase == corev1.PodRunning && isHostShellPodReady(pod):
		return 0
	case pod.Status.Phase == corev1.PodRunning:
		return 1
	case pod.Status.Phase == corev1.PodPending:
		return 2
	default:
		return 3
	}
}

func isHostShellPodReady(pod corev1.Pod) bool {
	for _, condition := range pod.Status.Conditions {
		if condition.Type == corev1.PodReady {
			return condition.Status == corev1.ConditionTrue
		}
	}

	for _, status := range pod.Status.ContainerStatuses {
		if status.Ready {
			return true
		}
	}

	return false
}

func requireNodeShellAccess(ctx context.Context) error {
	user, ok := authUserFromContext(ctx)
	if !ok || user == nil {
		return store.ErrSessionNotFound
	}
	if user.Role != "admin" {
		return errNodeShellAdminOnly
	}
	return nil
}

func writeNodeShellHandshakeError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}

	var requestErr *httpError
	if errors.As(err, &requestErr) {
		http.Error(w, requestErr.message, requestErr.status)
		return
	}

	if status, message, ok := translateUpstreamError(err); ok {
		http.Error(w, message, status)
		return
	}

	lower := strings.ToLower(err.Error())
	switch {
	case errors.Is(err, errNodeShellDisabled):
		http.Error(w, "节点终端未启用", http.StatusForbidden)
	case errors.Is(err, errNodeShellAdminOnly):
		http.Error(w, "仅管理员可使用节点终端", http.StatusForbidden)
	case errors.Is(err, errHostShellDaemonSetMissing):
		http.Error(w, "未检测到 host-shell DaemonSet，请先部署节点终端组件", http.StatusServiceUnavailable)
	case errors.Is(err, errHostShellPodUnavailable):
		http.Error(w, "目标节点上暂无可用的 host-shell Pod", http.StatusServiceUnavailable)
	case errors.Is(err, k8s.ErrClusterNotFound):
		http.Error(w, "Cluster not found", http.StatusNotFound)
	case k8serrors.IsNotFound(err):
		http.Error(w, "节点不存在", http.StatusNotFound)
	case strings.Contains(lower, "host-shell pod"):
		http.Error(w, errorMessageForAudit(err), http.StatusServiceUnavailable)
	default:
		http.Error(w, errorMessageForAudit(err), http.StatusInternalServerError)
	}
}
