package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"k8s-agent-backend/internal/k8s"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/remotecommand"
	k8scheme "k8s.io/client-go/kubernetes/scheme"
)

// execRequest 单次命令执行请求
type execRequest struct {
	Command   string `json:"command"`
	Container string `json:"container"`
}

// execResponse 执行结果响应
type execResponse struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	Error  string `json:"error,omitempty"`
}

// execPodStream 通过 HTTP POST 执行 Pod 中的命令并返回 stdout/stderr
// 前端调用：POST /api/pods/{ns}/{name}/exec  body: { command, container }
func execPodStream(
	ctx context.Context,
	k8sManager *k8s.Manager,
	clusterID, namespace, podName, container string,
	w http.ResponseWriter,
	r *http.Request,
) error {
	// 解析请求体
	var req execRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// 兼容 GET 请求（从 query 参数读取）
		req.Command = strings.TrimSpace(r.URL.Query().Get("command"))
		req.Container = container
	}
	if req.Container == "" {
		req.Container = container
	}
	if req.Command == "" {
		req.Command = "echo hello"
	}

	cluster, clientset, err := k8sManager.Client(ctx, clusterID)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, execResponse{Error: "无法连接集群: " + err.Error()})
		return nil
	}
	if cluster == nil {
		writeJSON(w, http.StatusNotFound, execResponse{Error: "集群未找到"})
		return nil
	}

	// 获取 Pod，若没有指定 container 则使用第一个
	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		writeJSON(w, http.StatusNotFound, execResponse{Error: "Pod 不存在: " + err.Error()})
		return nil
	}
	if req.Container == "" && len(pod.Spec.Containers) > 0 {
		req.Container = pod.Spec.Containers[0].Name
	}

	// 解析命令
	cmdParts := parseShellCommand(req.Command)

	restConfig, err := k8sManager.BuildConfig(cluster)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, execResponse{Error: "构建配置失败: " + err.Error()})
		return nil
	}

	execReq := clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: req.Container,
			Command:   cmdParts,
			Stdin:     false,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, k8scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restConfig, "POST", execReq.URL())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, execResponse{Error: "创建执行器失败: " + err.Error()})
		return nil
	}

	var stdout, stderr strings.Builder

	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	streamErr := executor.StreamWithContext(execCtx, remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		Tty:    false,
	})

	resp := execResponse{
		Stdout: stdout.String(),
		Stderr: stderr.String(),
	}
	if streamErr != nil {
		resp.Error = streamErr.Error()
	}

	writeJSON(w, http.StatusOK, resp)
	return nil
}

// parseShellCommand 将命令字符串解析为参数列表，支持引号
func parseShellCommand(cmd string) []string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return []string{"echo", ""}
	}
	// 对于复合命令（包含管道、重定向、分号等），通过 sh -c 执行
	if strings.ContainsAny(cmd, "|;&><`$(){}") || strings.Contains(cmd, "&&") || strings.Contains(cmd, "||") {
		return []string{"sh", "-c", cmd}
	}
	// 简单命令直接分割
	return strings.Fields(cmd)
}
