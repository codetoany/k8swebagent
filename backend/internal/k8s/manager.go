package k8s

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"k8s-agent-backend/internal/store"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
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
	cluster, err := m.clusterStore.GetDefault(ctx)
	if err != nil {
		return ConnectionResult{
			Status:    store.ConnectionStatusError,
			Message:   err.Error(),
			CheckedAt: time.Now(),
		}, err
	}
	if cluster == nil {
		return ConnectionResult{
			Status:    store.ConnectionStatusNotConfigured,
			Message:   "No default cluster configured",
			CheckedAt: time.Now(),
		}, nil
	}

	return m.CheckCluster(ctx, *cluster)
}

func (m *Manager) CheckClusterByID(ctx context.Context, id string) (ConnectionResult, *store.Cluster, error) {
	cluster, err := m.clusterStore.GetByID(ctx, id)
	if err != nil {
		return ConnectionResult{
			Status:    store.ConnectionStatusError,
			Message:   err.Error(),
			CheckedAt: time.Now(),
		}, nil, err
	}
	if cluster == nil {
		return ConnectionResult{
			Status:    store.ConnectionStatusNotConfigured,
			Message:   "Cluster not found",
			CheckedAt: time.Now(),
		}, nil, nil
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

	restConfig, err := m.buildRESTConfig(cluster)
	if err != nil {
		result.Status = store.ConnectionStatusError
		result.Message = err.Error()
		return result, nil
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
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
