package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"k8s-agent-backend/internal/k8s"
	"k8s-agent-backend/internal/store"

	"github.com/gorilla/websocket"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/rest"
	clientcmd "k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

const defaultClusterConsoleNamespace = "default"

var (
	errClusterConsoleDisabled  = errors.New("cluster console is disabled")
	errClusterConsoleAdminOnly = errors.New("cluster console is restricted to administrators")
)

type clusterConsoleMetaResponse struct {
	Enabled               bool   `json:"enabled"`
	AdminOnly             bool   `json:"adminOnly"`
	SessionTimeoutSeconds int    `json:"sessionTimeoutSeconds"`
	ShellPath             string `json:"shellPath"`
	KubectlPath           string `json:"kubectlPath"`
	ShellAvailable        bool   `json:"shellAvailable"`
	KubectlAvailable      bool   `json:"kubectlAvailable"`
	Message               string `json:"message,omitempty"`
}

type clusterConsoleSession struct {
	cluster   *store.Cluster
	clusterID string
	namespace string
}

type clusterConsoleRuntimeSpec struct {
	ClusterID   string
	ClusterName string
	Namespace   string
	Kubeconfig  []byte
	ShellPath   string
	KubectlPath string
}

type clusterConsoleWaitResult struct {
	ExitCode int
	Err      error
}

type clusterConsoleRuntime interface {
	io.ReadWriteCloser
	Resize(cols, rows uint16) error
	Wait() clusterConsoleWaitResult
}

type clusterConsoleAuditRecorder struct {
	mu       sync.Mutex
	current  []rune
	commands []string
}

func (h *handler) clusterConsoleMeta(w http.ResponseWriter, r *http.Request) error {
	if err := requireClusterConsoleAccess(r.Context()); err != nil {
		return err
	}

	shellAvailable, shellMessage := lookupConsoleBinary(h.clusterConsoleCfg.ShellPath)
	kubectlAvailable, kubectlMessage := lookupConsoleBinary(h.clusterConsoleCfg.KubectlPath)
	messageParts := make([]string, 0, 2)
	if shellMessage != "" {
		messageParts = append(messageParts, shellMessage)
	}
	if kubectlMessage != "" {
		messageParts = append(messageParts, kubectlMessage)
	}

	writeJSON(w, http.StatusOK, clusterConsoleMetaResponse{
		Enabled:               h.clusterConsoleCfg.Enabled,
		AdminOnly:             true,
		SessionTimeoutSeconds: h.clusterConsoleCfg.SessionTimeoutSeconds,
		ShellPath:             h.clusterConsoleCfg.ShellPath,
		KubectlPath:           h.clusterConsoleCfg.KubectlPath,
		ShellAvailable:        shellAvailable,
		KubectlAvailable:      kubectlAvailable,
		Message:               strings.Join(messageParts, "；"),
	})
	return nil
}

func (h *handler) clusterConsoleWS(w http.ResponseWriter, r *http.Request) {
	if err := requireClusterConsoleAccess(r.Context()); err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.console",
			ResourceType: "cluster",
			ResourceName: requestedClusterID(r),
			Namespace:    requestedConsoleNamespace(r),
			ClusterID:    requestedClusterID(r),
			Status:       store.AuditStatusFailed,
			Message:      "集群命令台会话建立失败: " + errorMessageForAudit(err),
		})
		writeClusterConsoleHandshakeError(w, err)
		return
	}

	if !h.clusterConsoleCfg.Enabled {
		err := errClusterConsoleDisabled
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.console",
			ResourceType: "cluster",
			ResourceName: requestedClusterID(r),
			Namespace:    requestedConsoleNamespace(r),
			ClusterID:    requestedClusterID(r),
			Status:       store.AuditStatusFailed,
			Message:      "集群命令台未启用",
		})
		writeClusterConsoleHandshakeError(w, err)
		return
	}

	clusterID := requestedClusterID(r)
	namespace := requestedConsoleNamespace(r)
	cols, rows := requestedTerminalSize(r)

	session, err := h.prepareClusterConsoleSession(r.Context(), clusterID, namespace)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.console",
			ResourceType: "cluster",
			ResourceName: clusterID,
			Namespace:    namespace,
			ClusterID:    clusterID,
			Status:       store.AuditStatusFailed,
			Message:      "集群命令台会话建立失败: " + errorMessageForAudit(err),
			Details: map[string]any{
				"namespace": namespace,
				"transport": "websocket",
				"error":     errorMessageForAudit(err),
			},
		})
		writeClusterConsoleHandshakeError(w, err)
		return
	}

	kubeconfig, err := h.buildClusterConsoleKubeconfig(session.cluster, session.namespace)
	if err != nil {
		h.recordAudit(r.Context(), r, store.AuditLogInput{
			Action:       "cluster.console",
			ResourceType: "cluster",
			ResourceName: session.cluster.Name,
			Namespace:    session.namespace,
			ClusterID:    session.clusterID,
			Status:       store.AuditStatusFailed,
			Message:      "集群命令台 kubeconfig 生成失败: " + errorMessageForAudit(err),
		})
		writeClusterConsoleHandshakeError(w, err)
		return
	}

	conn, err := execUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	result, commands, execErr := h.executeClusterConsoleSession(
		r.Context(),
		clusterConsoleRuntimeSpec{
			ClusterID:   session.cluster.ID,
			ClusterName: session.cluster.Name,
			Namespace:   session.namespace,
			Kubeconfig:  kubeconfig,
			ShellPath:   h.clusterConsoleCfg.ShellPath,
			KubectlPath: h.clusterConsoleCfg.KubectlPath,
		},
		conn,
		cols,
		rows,
	)

	status := store.AuditStatusSuccess
	message := "集群命令台会话已结束"
	if execErr != nil && !isNormalExecSocketClose(execErr) {
		status = store.AuditStatusFailed
		message = "集群命令台会话异常结束: " + errorMessageForAudit(execErr)
	}

	h.recordAudit(r.Context(), r, store.AuditLogInput{
		Action:       "cluster.console",
		ResourceType: "cluster",
		ResourceName: session.cluster.Name,
		Namespace:    session.namespace,
		ClusterID:    session.clusterID,
		Status:       status,
		Message:      message,
		Details: map[string]any{
			"transport":    "websocket",
			"commands":     commands,
			"commandCount": len(commands),
			"exitCode":     result.ExitCode,
			"closeReason":  result.CloseReason,
		},
	})
}

type clusterConsoleResult struct {
	CloseReason string
	ExitCode    int
}

func (h *handler) prepareClusterConsoleSession(ctx context.Context, clusterID, namespace string) (*clusterConsoleSession, error) {
	cluster, clientset, err := h.k8sManager.Client(ctx, clusterID)
	if err != nil {
		return nil, err
	}
	if cluster == nil {
		return nil, errors.New("cluster not found")
	}

	namespace = requestedConsoleNamespaceWithFallback(namespace)
	if namespace != "" {
		if _, err := clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{}); err != nil {
			return nil, err
		}
	}

	return &clusterConsoleSession{
		cluster:   cluster,
		clusterID: cluster.ID,
		namespace: namespace,
	}, nil
}

func (h *handler) buildClusterConsoleKubeconfig(cluster *store.Cluster, namespace string) ([]byte, error) {
	if cluster == nil {
		return nil, errors.New("cluster is nil")
	}

	namespace = requestedConsoleNamespaceWithFallback(namespace)
	switch cluster.Mode {
	case store.ClusterModeKubeconfig:
		cfg, err := loadClusterConsoleKubeconfig(cluster)
		if err != nil {
			return nil, err
		}
		ensureClusterConsoleCurrentContext(cfg)
		if cfg.CurrentContext != "" && cfg.Contexts[cfg.CurrentContext] != nil {
			cfg.Contexts[cfg.CurrentContext].Namespace = namespace
		}
		return clientcmd.Write(*cfg)
	default:
		restConfig, err := h.k8sManager.BuildConfig(cluster)
		if err != nil {
			return nil, err
		}
		return writeClusterConsoleRESTConfig(cluster.Name, namespace, restConfig)
	}
}

func loadClusterConsoleKubeconfig(cluster *store.Cluster) (*clientcmdapi.Config, error) {
	switch {
	case strings.TrimSpace(cluster.KubeconfigPath) != "":
		cfg, err := clientcmd.LoadFromFile(strings.TrimSpace(cluster.KubeconfigPath))
		if err != nil {
			return nil, err
		}
		if err := clientcmdapi.FlattenConfig(cfg); err != nil {
			return nil, err
		}
		return cfg, nil
	case strings.TrimSpace(cluster.Kubeconfig) != "":
		cfg, err := clientcmd.Load([]byte(cluster.Kubeconfig))
		if err != nil {
			return nil, err
		}
		return cfg, nil
	default:
		return nil, errors.New("kubeconfig mode requires kubeconfig or kubeconfigPath")
	}
}

func ensureClusterConsoleCurrentContext(cfg *clientcmdapi.Config) {
	if cfg == nil {
		return
	}
	if strings.TrimSpace(cfg.CurrentContext) != "" && cfg.Contexts[cfg.CurrentContext] != nil {
		return
	}

	names := make([]string, 0, len(cfg.Contexts))
	for name := range cfg.Contexts {
		names = append(names, name)
	}
	sort.Strings(names)
	if len(names) > 0 {
		cfg.CurrentContext = names[0]
	}
}

func writeClusterConsoleRESTConfig(clusterName, namespace string, restCfg *rest.Config) ([]byte, error) {
	if restCfg == nil {
		return nil, errors.New("rest config is nil")
	}

	clusterKey := strings.TrimSpace(clusterName)
	if clusterKey == "" {
		clusterKey = "default-cluster"
	}
	authKey := clusterKey + "-auth"
	contextKey := clusterKey + "-context"

	cfg := clientcmdapi.NewConfig()
	cfg.Clusters[clusterKey] = &clientcmdapi.Cluster{
		Server:                   restCfg.Host,
		InsecureSkipTLSVerify:    restCfg.Insecure,
		CertificateAuthorityData: restCfg.CAData,
		TLSServerName:            restCfg.ServerName,
	}
	cfg.AuthInfos[authKey] = &clientcmdapi.AuthInfo{
		Token:                 restCfg.BearerToken,
		Username:              restCfg.Username,
		Password:              restCfg.Password,
		ClientCertificateData: restCfg.CertData,
		ClientKeyData:         restCfg.KeyData,
	}
	cfg.Contexts[contextKey] = &clientcmdapi.Context{
		Cluster:   clusterKey,
		AuthInfo:  authKey,
		Namespace: namespace,
	}
	cfg.CurrentContext = contextKey

	return clientcmd.Write(*cfg)
}

func (h *handler) executeClusterConsoleSession(
	ctx context.Context,
	spec clusterConsoleRuntimeSpec,
	conn *websocket.Conn,
	initialCols, initialRows uint16,
) (clusterConsoleResult, []string, error) {
	timeout := time.Duration(h.clusterConsoleCfg.SessionTimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}

	runtime, err := startClusterConsoleRuntime(spec, initialCols, initialRows)
	if err != nil {
		return clusterConsoleResult{CloseReason: err.Error(), ExitCode: 1}, nil, err
	}
	defer runtime.Close()

	result := clusterConsoleResult{}
	sender := &execSocketSender{conn: conn}
	recorder := &clusterConsoleAuditRecorder{}

	if err := sender.Send(execSocketResponse{
		Type:    "ready",
		Message: fmt.Sprintf("Connected to cluster %s (namespace: %s)", spec.ClusterName, spec.Namespace),
	}); err != nil {
		return result, recorder.Commands(), err
	}

	sessionCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	waitCh := make(chan clusterConsoleWaitResult, 1)
	inputErrCh := make(chan error, 1)
	outputErrCh := make(chan error, 1)

	go func() {
		waitCh <- runtime.Wait()
	}()

	go func() {
		inputErrCh <- readClusterConsoleSocketInput(conn, runtime, recorder)
	}()

	go func() {
		outputErrCh <- streamClusterConsoleOutput(runtime, sender)
	}()

	var (
		waitResult clusterConsoleWaitResult
		inputErr   error
		outputErr  error
		mainErr    error
	)

	select {
	case waitResult = <-waitCh:
		result.CloseReason = "shell exited"
		result.ExitCode = waitResult.ExitCode
		mainErr = waitResult.Err
	case inputErr = <-inputErrCh:
		result.CloseReason = "client disconnected"
		mainErr = inputErr
	case outputErr = <-outputErrCh:
		result.CloseReason = "terminal output closed"
		mainErr = outputErr
	case <-sessionCtx.Done():
		result.CloseReason = "session timed out"
		result.ExitCode = 124
		mainErr = sessionCtx.Err()
	}

	_ = runtime.Close()
	cancel()

	if waitResult.Err == nil {
		select {
		case waitResult = <-waitCh:
			if result.ExitCode == 0 {
				result.ExitCode = waitResult.ExitCode
			}
		case <-time.After(2 * time.Second):
		}
	}
	if inputErr == nil {
		select {
		case inputErr = <-inputErrCh:
		case <-time.After(500 * time.Millisecond):
		}
	}
	if outputErr == nil {
		select {
		case outputErr = <-outputErrCh:
		case <-time.After(500 * time.Millisecond):
		}
	}

	if waitResult.Err != nil && mainErr == nil {
		mainErr = waitResult.Err
	}
	if outputErr != nil && !isNormalExecSocketClose(outputErr) && mainErr == nil {
		mainErr = outputErr
	}
	if inputErr != nil && !isNormalExecSocketClose(inputErr) && mainErr == nil {
		mainErr = inputErr
	}
	if errors.Is(mainErr, context.DeadlineExceeded) {
		mainErr = newHTTPError(http.StatusGatewayTimeout, "集群命令台会话已超时，请重新连接")
	}
	if isNormalExecSocketClose(mainErr) && waitResult.Err == nil {
		mainErr = nil
	}
	if result.CloseReason == "terminal output closed" && waitResult.Err == nil {
		result.CloseReason = "shell exited"
	}

	if mainErr != nil {
		_ = sender.Send(execSocketResponse{
			Type:    "error",
			Message: errorMessageForAudit(mainErr),
			Code:    result.ExitCode,
		})
	}

	exitMessage := "Session closed"
	switch {
	case result.CloseReason == "session timed out":
		exitMessage = "会话超时，终端已关闭"
	case result.CloseReason != "":
		exitMessage = result.CloseReason
	}
	_ = sender.Send(execSocketResponse{
		Type:    "exit",
		Message: exitMessage,
		Code:    result.ExitCode,
	})

	return result, recorder.Commands(), mainErr
}

func readClusterConsoleSocketInput(conn *websocket.Conn, runtime clusterConsoleRuntime, recorder *clusterConsoleAuditRecorder) error {
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
			recorder.WriteInput(msg.Data)
			if _, err := io.WriteString(runtime, msg.Data); err != nil {
				return err
			}
		case "resize":
			if err := runtime.Resize(msg.Cols, msg.Rows); err != nil {
				return err
			}
		case "ping":
			continue
		case "close":
			return io.EOF
		}
	}
}

func streamClusterConsoleOutput(runtime clusterConsoleRuntime, sender *execSocketSender) error {
	buffer := make([]byte, 4096)
	for {
		n, err := runtime.Read(buffer)
		if n > 0 {
			if sendErr := sender.Send(execSocketResponse{
				Type:   "output",
				Stream: "stdout",
				Data:   string(buffer[:n]),
			}); sendErr != nil {
				return sendErr
			}
		}
		if err != nil {
			if isNormalClusterConsoleOutputClose(err) {
				return nil
			}
			return err
		}
	}
}

func isNormalClusterConsoleOutputClose(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrClosed) || errors.Is(err, io.EOF) {
		return true
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "/dev/ptmx") && strings.Contains(message, "input/output error")
}

func requireClusterConsoleAccess(ctx context.Context) error {
	user, ok := authUserFromContext(ctx)
	if !ok || user == nil {
		return store.ErrSessionNotFound
	}
	if user.Role != "admin" {
		return errClusterConsoleAdminOnly
	}
	return nil
}

func requestedConsoleNamespace(r *http.Request) string {
	if r == nil {
		return defaultClusterConsoleNamespace
	}
	return requestedConsoleNamespaceWithFallback(r.URL.Query().Get("namespace"))
}

func requestedConsoleNamespaceWithFallback(namespace string) string {
	namespace = strings.TrimSpace(namespace)
	if namespace == "" {
		return defaultClusterConsoleNamespace
	}
	return namespace
}

func lookupConsoleBinary(path string) (bool, string) {
	if strings.TrimSpace(path) == "" {
		return false, "未配置可执行文件路径"
	}
	if _, err := exec.LookPath(strings.TrimSpace(path)); err != nil {
		return false, fmt.Sprintf("%s 不可用", path)
	}
	return true, ""
}

func writeClusterConsoleHandshakeError(w http.ResponseWriter, err error) {
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

	switch {
	case errors.Is(err, errClusterConsoleDisabled):
		http.Error(w, "集群命令台未启用", http.StatusForbidden)
	case errors.Is(err, errClusterConsoleAdminOnly):
		http.Error(w, "仅管理员可使用集群命令台", http.StatusForbidden)
	case errors.Is(err, k8s.ErrClusterNotFound):
		http.Error(w, "Cluster not found", http.StatusNotFound)
	case k8serrors.IsNotFound(err):
		http.Error(w, "命名空间不存在", http.StatusNotFound)
	default:
		http.Error(w, errorMessageForAudit(err), http.StatusInternalServerError)
	}
}

func (r *clusterConsoleAuditRecorder) WriteInput(data string) {
	if r == nil || data == "" {
		return
	}

	data = stripClusterConsoleControlSequences(data)

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, char := range data {
		switch char {
		case '\r', '\n':
			r.flushLocked()
		case '\b', 0x7f:
			if len(r.current) > 0 {
				r.current = r.current[:len(r.current)-1]
			}
		default:
			if unicode.IsPrint(char) || char == ' ' || char == '\t' {
				r.current = append(r.current, char)
			}
		}
	}
}

func (r *clusterConsoleAuditRecorder) Commands() []string {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.flushLocked()

	commands := make([]string, len(r.commands))
	copy(commands, r.commands)
	return commands
}

func (r *clusterConsoleAuditRecorder) flushLocked() {
	command := strings.TrimSpace(string(r.current))
	if command != "" {
		r.commands = append(r.commands, command)
	}
	r.current = r.current[:0]
}

func stripClusterConsoleControlSequences(data string) string {
	replacer := strings.NewReplacer(
		"\x1b[A", "",
		"\x1b[B", "",
		"\x1b[C", "",
		"\x1b[D", "",
		"\x1bOA", "",
		"\x1bOB", "",
		"\x1bOC", "",
		"\x1bOD", "",
	)
	return replacer.Replace(data)
}
