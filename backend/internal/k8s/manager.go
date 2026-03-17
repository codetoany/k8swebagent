package k8s

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"k8s-agent-backend/internal/store"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var (
	ErrClusterNotConfigured = errors.New("default cluster not configured")
	ErrClusterNotFound      = errors.New("cluster not found")
	ErrClusterDisabled      = errors.New("cluster is disabled")
)

type Manager struct {
	clusterStore   *store.ClusterStore
	requestTimeout time.Duration
}

type ConnectionResult struct {
	Status        string    `json:"status"`
	ClusterID     string    `json:"clusterId,omitempty"`
	ClusterName   string    `json:"clusterName,omitempty"`
	Mode          string    `json:"mode,omitempty"`
	ServerVersion string    `json:"serverVersion,omitempty"`
	Message       string    `json:"message,omitempty"`
	CheckedAt     time.Time `json:"checkedAt"`
}

func NewManager(clusterStore *store.ClusterStore, requestTimeout time.Duration) *Manager {
	if requestTimeout <= 0 {
		requestTimeout = 10 * time.Second
	}

	return &Manager{
		clusterStore:   clusterStore,
		requestTimeout: requestTimeout,
	}
}

func (m *Manager) CheckDefaultCluster(ctx context.Context) (ConnectionResult, error) {
	cluster, err := m.resolveCluster(ctx, "")
	if err != nil {
		if errors.Is(err, ErrClusterNotConfigured) {
			return ConnectionResult{
				Status:    store.ConnectionStatusNotConfigured,
				Message:   "No default cluster configured",
				CheckedAt: time.Now(),
			}, nil
		}
		return ConnectionResult{
			Status:    store.ConnectionStatusError,
			Message:   err.Error(),
			CheckedAt: time.Now(),
		}, err
	}

	return m.CheckCluster(ctx, *cluster)
}

func (m *Manager) CheckClusterSelection(ctx context.Context, clusterID string) (ConnectionResult, error) {
	cluster, err := m.resolveCluster(ctx, clusterID)
	if err != nil {
		switch {
		case errors.Is(err, ErrClusterNotConfigured):
			return ConnectionResult{
				Status:    store.ConnectionStatusNotConfigured,
				Message:   "No default cluster configured",
				CheckedAt: time.Now(),
			}, nil
		case errors.Is(err, ErrClusterNotFound):
			return ConnectionResult{
				Status:    store.ConnectionStatusNotConfigured,
				Message:   "Cluster not found",
				CheckedAt: time.Now(),
			}, nil
		default:
			return ConnectionResult{
				Status:    store.ConnectionStatusError,
				Message:   err.Error(),
				CheckedAt: time.Now(),
			}, err
		}
	}

	return m.CheckCluster(ctx, *cluster)
}

func (m *Manager) CheckClusterByID(ctx context.Context, id string) (ConnectionResult, *store.Cluster, error) {
	cluster, err := m.resolveCluster(ctx, id)
	if err != nil {
		if errors.Is(err, ErrClusterNotFound) {
			return ConnectionResult{
				Status:    store.ConnectionStatusNotConfigured,
				Message:   "Cluster not found",
				CheckedAt: time.Now(),
			}, nil, nil
		}
		return ConnectionResult{
			Status:    store.ConnectionStatusError,
			Message:   err.Error(),
			CheckedAt: time.Now(),
		}, nil, err
	}

	result, err := m.CheckCluster(ctx, *cluster)
	return result, cluster, err
}

func (m *Manager) CheckCluster(ctx context.Context, cluster store.Cluster) (ConnectionResult, error) {
	result := ConnectionResult{
		Status:      store.ConnectionStatusUnknown,
		ClusterID:   cluster.ID,
		ClusterName: cluster.Name,
		Mode:        cluster.Mode,
		CheckedAt:   time.Now(),
	}

	if !cluster.IsEnabled {
		result.Status = store.ConnectionStatusNotConfigured
		result.Message = "Cluster is disabled"
		return result, nil
	}

	clientset, err := m.clientForCluster(cluster)
	if err != nil {
		result.Status = store.ConnectionStatusError
		result.Message = err.Error()
		return result, nil
	}

	version, err := clientset.Discovery().ServerVersion()
	if err != nil {
		result.Status = store.ConnectionStatusError
		result.Message = err.Error()
		return result, nil
	}

	result.Status = store.ConnectionStatusConnected
	result.ServerVersion = version.GitVersion
	result.Message = "Cluster connection successful"
	return result, nil
}

func (m *Manager) DefaultClient(ctx context.Context) (*store.Cluster, *kubernetes.Clientset, error) {
	return m.Client(ctx, "")
}

func (m *Manager) Client(ctx context.Context, clusterID string) (*store.Cluster, *kubernetes.Clientset, error) {
	cluster, err := m.resolveCluster(ctx, clusterID)
	if err != nil {
		return nil, nil, err
	}
	if !cluster.IsEnabled {
		return cluster, nil, ErrClusterDisabled
	}

	clientset, err := m.clientForCluster(*cluster)
	if err != nil {
		return cluster, nil, err
	}

	return cluster, clientset, nil
}

func (m *Manager) DefaultDynamicClient(ctx context.Context) (*store.Cluster, dynamic.Interface, error) {
	return m.DynamicClient(ctx, "")
}

func (m *Manager) DynamicClient(ctx context.Context, clusterID string) (*store.Cluster, dynamic.Interface, error) {
	cluster, err := m.resolveCluster(ctx, clusterID)
	if err != nil {
		return nil, nil, err
	}
	if !cluster.IsEnabled {
		return cluster, nil, ErrClusterDisabled
	}

	dynClient, err := m.dynamicClientForCluster(*cluster)
	if err != nil {
		return cluster, nil, err
	}

	return cluster, dynClient, nil
}

func (m *Manager) resolveCluster(ctx context.Context, clusterID string) (*store.Cluster, error) {
	if strings.TrimSpace(clusterID) != "" {
		cluster, err := m.clusterStore.GetByID(ctx, clusterID)
		if err != nil {
			return nil, err
		}
		if cluster == nil {
			return nil, ErrClusterNotFound
		}

		return cluster, nil
	}

	cluster, err := m.clusterStore.GetDefault(ctx)
	if err != nil {
		return nil, err
	}
	if cluster == nil {
		return nil, ErrClusterNotConfigured
	}

	return cluster, nil
}

// BuildConfig 返回给定集群的 *rest.Config，供外部包（如 exec）使用
func (m *Manager) BuildConfig(cluster *store.Cluster) (*rest.Config, error) {
	if cluster == nil {
		return nil, errors.New("cluster is nil")
	}
	return m.buildRESTConfig(*cluster)
}

func (m *Manager) clientForCluster(cluster store.Cluster) (*kubernetes.Clientset, error) {
	restConfig, err := m.buildRESTConfig(cluster)
	if err != nil {
		return nil, err
	}

	return kubernetes.NewForConfig(restConfig)
}

func (m *Manager) dynamicClientForCluster(cluster store.Cluster) (dynamic.Interface, error) {
	restConfig, err := m.buildRESTConfig(cluster)
	if err != nil {
		return nil, err
	}

	return dynamic.NewForConfig(restConfig)
}

func (m *Manager) buildRESTConfig(cluster store.Cluster) (*rest.Config, error) {
	mode := strings.TrimSpace(cluster.Mode)
	if mode == "" {
		return nil, errors.New("cluster mode is required")
	}

	var (
		cfg *rest.Config
		err error
	)

	switch mode {
	case store.ClusterModeInCluster:
		cfg, err = rest.InClusterConfig()
	case store.ClusterModeKubeconfig:
		switch {
		case strings.TrimSpace(cluster.Kubeconfig) != "":
			cfg, err = clientcmd.RESTConfigFromKubeConfig([]byte(cluster.Kubeconfig))
		case strings.TrimSpace(cluster.KubeconfigPath) != "":
			cfg, err = clientcmd.BuildConfigFromFlags("", cluster.KubeconfigPath)
		default:
			err = errors.New("kubeconfig mode requires kubeconfig or kubeconfigPath")
		}
	case store.ClusterModeToken:
		if strings.TrimSpace(cluster.APIServer) == "" {
			return nil, errors.New("token mode requires apiServer")
		}
		if strings.TrimSpace(cluster.Token) == "" {
			return nil, errors.New("token mode requires token")
		}

		cfg = &rest.Config{
			Host:        cluster.APIServer,
			BearerToken: cluster.Token,
			TLSClientConfig: rest.TLSClientConfig{
				Insecure: cluster.InsecureSkipTLSVerify,
			},
		}
		if strings.TrimSpace(cluster.CAData) != "" {
			cfg.TLSClientConfig.CAData = decodeMaybeBase64(cluster.CAData)
		}
	default:
		err = fmt.Errorf("unsupported cluster mode: %s", cluster.Mode)
	}

	if err != nil {
		return nil, err
	}

	cfg.Timeout = m.requestTimeout
	return cfg, nil
}

func decodeMaybeBase64(value string) []byte {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err == nil && len(decoded) > 0 {
		return decoded
	}

	return []byte(trimmed)
}
