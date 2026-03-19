package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8scheme "k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
	utilexec "k8s.io/client-go/util/exec"
)

const (
	defaultExecCols = 120
	defaultExecRows = 32
)

var execUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type execRequest struct {
	Command   string `json:"command"`
	Container string `json:"container"`
}

type execResponse struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	Error  string `json:"error,omitempty"`
}

type execSocketRequest struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

type execSocketResponse struct {
	Type      string `json:"type"`
	Stream    string `json:"stream,omitempty"`
	Data      string `json:"data,omitempty"`
	Message   string `json:"message,omitempty"`
	Container string `json:"container,omitempty"`
	Code      int    `json:"code,omitempty"`
}

type execSession struct {
	cluster   *store.Cluster
	namespace string
	podName   string
	container string
	command   []string
	executor  remotecommand.Executor
}

type execTerminalResult struct {
	Container   string
	CloseReason string
	ExitCode    int
}

type execSocketSender struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

type execSocketWriter struct {
	sender *execSocketSender
	stream string
}

type execTerminalSizeQueue struct {
	ch   chan remotecommand.TerminalSize
	once sync.Once
}

// execPodStream keeps the existing one-shot POST endpoint for compatibility.
func execPodStream(
	ctx context.Context,
	k8sManager *k8s.Manager,
	clusterID, namespace, podName, container string,
	w http.ResponseWriter,
	r *http.Request,
) error {
	var req execRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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

	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		writeJSON(w, http.StatusNotFound, execResponse{Error: "Pod 不存在: " + err.Error()})
		return nil
	}
	if req.Container == "" && len(pod.Spec.Containers) > 0 {
		req.Container = pod.Spec.Containers[0].Name
	}

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

func (h *handler) podExecWS(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	clusterID := requestedClusterID(r)
	command := requestedExecCommand(r)
	cols, rows := requestedTerminalSize(r)

	session, err := prepareExecSession(r.Context(), h.k8sManager, clusterID, namespace, name, container, command)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "pod.exec",
			ResourceType: "pod",
			ResourceName: name,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      "Pod Exec 会话建立失败: " + errorMessageForAudit(err),
			Details: map[string]any{
				"transport": "websocket",
				"container": container,
				"command":   command,
				"error":     errorMessageForAudit(err),
			},
		})
		writeExecHandshakeError(w, err)
		return
	}

	conn, err := execUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	result, execErr := executeTerminalSession(r.Context(), session, conn, cols, rows)
	status := store.AuditStatusSuccess
	message := "Pod Exec 会话已结束"
	if execErr != nil && !isNormalExecSocketClose(execErr) {
		status = store.AuditStatusFailed
		message = "Pod Exec 会话异常结束: " + errorMessageForAudit(execErr)
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "pod.exec",
		ResourceType: "pod",
		ResourceName: name,
		Namespace:    namespace,
		ClusterID:    clusterID,
		Status:       status,
		Message:      message,
		Details: map[string]any{
			"transport":   "websocket",
			"container":   result.Container,
			"command":     command,
			"exitCode":    result.ExitCode,
			"closeReason": result.CloseReason,
		},
	})
}

func prepareExecSession(
	ctx context.Context,
	k8sManager *k8s.Manager,
	clusterID, namespace, podName, container string,
	command []string,
) (*execSession, error) {
	cluster, clientset, err := k8sManager.Client(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if cluster == nil {
		return nil, errors.New("cluster not found")
	}

	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	if container == "" && len(pod.Spec.Containers) > 0 {
		container = pod.Spec.Containers[0].Name
	}
	if container == "" {
		return nil, errors.New("pod has no available containers")
	}

	restConfig, err := k8sManager.BuildConfig(cluster)
	if err != nil {
		return nil, err
	}

	execReq := clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   command,
			Stdin:     true,
			Stdout:    true,
			Stderr:    false,
			TTY:       true,
		}, k8scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restConfig, http.MethodPost, execReq.URL())
	if err != nil {
		return nil, err
	}

	return &execSession{
		cluster:   cluster,
		namespace: namespace,
		podName:   podName,
		container: container,
		command:   command,
		executor:  executor,
	}, nil
}

func executeTerminalSession(ctx context.Context, session *execSession, conn *websocket.Conn, initialCols, initialRows uint16) (execTerminalResult, error) {
	result := execTerminalResult{
		Container: session.container,
	}

	sender := &execSocketSender{conn: conn}
	sizeQueue := newExecTerminalSizeQueue(initialCols, initialRows)
	stdinReader, stdinWriter := io.Pipe()

	defer sizeQueue.Close()
	defer stdinReader.Close()
	defer stdinWriter.Close()

	if err := sender.Send(execSocketResponse{
		Type:      "ready",
		Container: session.container,
		Message:   fmt.Sprintf("Connected to %s/%s", session.namespace, session.podName),
	}); err != nil {
		return result, err
	}

	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	streamErrCh := make(chan error, 1)
	inputErrCh := make(chan error, 1)

	go func() {
		streamErrCh <- session.executor.StreamWithContext(streamCtx, remotecommand.StreamOptions{
			Stdin:             stdinReader,
			Stdout:            &execSocketWriter{sender: sender, stream: "stdout"},
			Stderr:            nil,
			Tty:               true,
			TerminalSizeQueue: sizeQueue,
		})
	}()

	go func() {
		inputErrCh <- readExecSocketInput(conn, stdinWriter, sizeQueue)
	}()

	var (
		streamErr error
		inputErr  error
	)

	select {
	case streamErr = <-streamErrCh:
		result.CloseReason = "process exited"
	case inputErr = <-inputErrCh:
		result.CloseReason = "client disconnected"
	}

	cancel()
	sizeQueue.Close()
	_ = stdinWriter.Close()

	if streamErr == nil {
		select {
		case streamErr = <-streamErrCh:
		case <-time.After(2 * time.Second):
		}
	}
	if inputErr == nil {
		select {
		case inputErr = <-inputErrCh:
		case <-time.After(500 * time.Millisecond):
		}
	}

	if streamErr != nil {
		result.ExitCode = exitCodeFromError(streamErr)
		if errors.Is(streamErr, context.Canceled) && isNormalExecSocketClose(inputErr) {
			streamErr = nil
		}
	}

	if inputErr != nil && !isNormalExecSocketClose(inputErr) && streamErr == nil {
		streamErr = inputErr
	}

	if streamErr != nil {
		result.CloseReason = streamErr.Error()
		_ = sender.Send(execSocketResponse{
			Type:    "error",
			Message: streamErr.Error(),
			Code:    result.ExitCode,
		})
	}

	exitMessage := "Session closed"
	if result.CloseReason != "" {
		exitMessage = result.CloseReason
	}
	_ = sender.Send(execSocketResponse{
		Type:    "exit",
		Message: exitMessage,
		Code:    result.ExitCode,
	})

	return result, streamErr
}

func readExecSocketInput(conn *websocket.Conn, stdin *io.PipeWriter, sizeQueue *execTerminalSizeQueue) error {
	conn.SetReadLimit(1 << 20)

	for {
		var msg execSocketRequest
		if err := conn.ReadJSON(&msg); err != nil {
			return err
		}

		switch strings.ToLower(strings.TrimSpace(msg.Type)) {
		case "input":
			if msg.Data == "" {
				continue
			}
			if _, err := io.WriteString(stdin, msg.Data); err != nil {
				return err
			}
		case "resize":
			sizeQueue.Push(msg.Cols, msg.Rows)
		case "ping":
			continue
		case "close":
			return io.EOF
		}
	}
}

func requestedExecCommand(r *http.Request) []string {
	command := strings.TrimSpace(r.URL.Query().Get("command"))
	if command == "" {
		return []string{"sh"}
	}
	return parseShellCommand(command)
}

func requestedTerminalSize(r *http.Request) (uint16, uint16) {
	cols := requestedUint16(r, "cols", defaultExecCols)
	rows := requestedUint16(r, "rows", defaultExecRows)
	return cols, rows
}

func requestedUint16(r *http.Request, key string, fallback uint16) uint16 {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}

	var parsed uint16
	if _, err := fmt.Sscanf(value, "%d", &parsed); err != nil || parsed == 0 {
		return fallback
	}
	return parsed
}

func exitCodeFromError(err error) int {
	if err == nil {
		return 0
	}

	var codeExitErr interface{ ExitStatus() int }
	if errors.As(err, &codeExitErr) {
		return codeExitErr.ExitStatus()
	}

	var exitErr utilexec.ExitError
	if errors.As(err, &exitErr) && exitErr.Exited() {
		return 1
	}

	return 1
}

func isNormalExecSocketClose(err error) bool {
	if err == nil || errors.Is(err, io.EOF) {
		return true
	}

	return websocket.IsCloseError(
		err,
		websocket.CloseNormalClosure,
		websocket.CloseGoingAway,
		websocket.CloseNoStatusReceived,
	)
}

func (s *execSocketSender) Send(msg execSocketResponse) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return s.conn.WriteJSON(msg)
}

func (w *execSocketWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if err := w.sender.Send(execSocketResponse{
		Type:   "output",
		Stream: w.stream,
		Data:   string(p),
	}); err != nil {
		return 0, err
	}
	return len(p), nil
}

func newExecTerminalSizeQueue(cols, rows uint16) *execTerminalSizeQueue {
	queue := &execTerminalSizeQueue{
		ch: make(chan remotecommand.TerminalSize, 1),
	}
	queue.Push(cols, rows)
	return queue
}

func (q *execTerminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}
	return &size
}

func (q *execTerminalSizeQueue) Push(cols, rows uint16) {
	if cols == 0 || rows == 0 {
		return
	}

	size := remotecommand.TerminalSize{
		Width:  cols,
		Height: rows,
	}

	select {
	case q.ch <- size:
	default:
		select {
		case <-q.ch:
		default:
		}
		q.ch <- size
	}
}

func (q *execTerminalSizeQueue) Close() {
	q.once.Do(func() {
		close(q.ch)
	})
}

// parseShellCommand converts a shell string into argv, falling back to sh -c for compound commands.
func parseShellCommand(cmd string) []string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return []string{"echo", ""}
	}
	if strings.ContainsAny(cmd, "|;&><`$(){}") || strings.Contains(cmd, "&&") || strings.Contains(cmd, "||") {
		return []string{"sh", "-c", cmd}
	}
	return strings.Fields(cmd)
}

func writeExecHandshakeError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}

	if status, message, ok := translateUpstreamError(err); ok {
		http.Error(w, message, status)
		return
	}

	lower := strings.ToLower(err.Error())
	switch {
	case errors.Is(err, k8s.ErrClusterNotFound), strings.Contains(lower, "cluster not found"):
		http.Error(w, "Cluster not found", http.StatusNotFound)
	case k8serrors.IsNotFound(err):
		http.Error(w, "Pod 不存在", http.StatusNotFound)
	case strings.Contains(lower, "no available containers"):
		http.Error(w, "Pod 没有可用的容器", http.StatusBadRequest)
	default:
		http.Error(w, errorMessageForAudit(err), http.StatusInternalServerError)
	}
}
