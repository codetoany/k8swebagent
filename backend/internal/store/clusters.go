package store

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"

	"k8s-agent-backend/internal/config"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	ClusterModeInCluster  = "in-cluster"
	ClusterModeKubeconfig = "kubeconfig"
	ClusterModeToken      = "token"

	ConnectionStatusUnknown       = "unknown"
	ConnectionStatusConnected     = "connected"
	ConnectionStatusError         = "error"
	ConnectionStatusNotConfigured = "not_configured"
)

type Cluster struct {
	ID                    string     `json:"id"`
	Name                  string     `json:"name"`
	Mode                  string     `json:"mode"`
	APIServer             string     `json:"apiServer,omitempty"`
	KubeconfigPath        string     `json:"kubeconfigPath,omitempty"`
	Kubeconfig            string     `json:"kubeconfig,omitempty"`
	Token                 string     `json:"token,omitempty"`
	CAData                string     `json:"caData,omitempty"`
	InsecureSkipTLSVerify bool       `json:"insecureSkipTLSVerify"`
	IsDefault             bool       `json:"isDefault"`
	IsEnabled             bool       `json:"isEnabled"`
	LastConnectionStatus  string     `json:"lastConnectionStatus"`
	LastConnectionError   string     `json:"lastConnectionError,omitempty"`
	LastConnectedAt       *time.Time `json:"lastConnectedAt,omitempty"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

type ClusterStore struct {
	pool *pgxpool.Pool
}

type rowScanner interface {
	Scan(dest ...any) error
}

func NewClusterStore(pool *pgxpool.Pool) *ClusterStore {
	return &ClusterStore{pool: pool}
}

func (s *ClusterStore) Init(ctx context.Context, bootstrap config.K8sBootstrapConfig) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS clusters (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			mode TEXT NOT NULL,
			api_server TEXT NOT NULL DEFAULT '',
			kubeconfig_path TEXT NOT NULL DEFAULT '',
			kubeconfig TEXT NOT NULL DEFAULT '',
			token TEXT NOT NULL DEFAULT '',
			ca_data TEXT NOT NULL DEFAULT '',
			insecure_skip_tls_verify BOOLEAN NOT NULL DEFAULT FALSE,
			is_default BOOLEAN NOT NULL DEFAULT FALSE,
			is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
			last_connection_status TEXT NOT NULL DEFAULT 'unknown',
			last_connection_error TEXT NOT NULL DEFAULT '',
			last_connected_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	if strings.TrimSpace(bootstrap.Mode) == "" {
		return nil
	}

	_, err = s.Save(ctx, Cluster{
		ID:                    "bootstrap-default",
		Name:                  strings.TrimSpace(bootstrap.Name),
		Mode:                  strings.TrimSpace(bootstrap.Mode),
		APIServer:             strings.TrimSpace(bootstrap.APIServer),
		KubeconfigPath:        strings.TrimSpace(bootstrap.KubeconfigPath),
		Kubeconfig:            strings.TrimSpace(bootstrap.Kubeconfig),
		Token:                 strings.TrimSpace(bootstrap.Token),
		CAData:                strings.TrimSpace(bootstrap.CAData),
		InsecureSkipTLSVerify: bootstrap.InsecureSkipTLSVerify,
		IsDefault:             true,
		IsEnabled:             true,
		LastConnectionStatus:  ConnectionStatusUnknown,
	})
	return err
}

func (s *ClusterStore) Save(ctx context.Context, cluster Cluster) (*Cluster, error) {
	cluster.Name = strings.TrimSpace(cluster.Name)
	cluster.Mode = strings.TrimSpace(cluster.Mode)
	cluster.APIServer = strings.TrimSpace(cluster.APIServer)
	cluster.KubeconfigPath = strings.TrimSpace(cluster.KubeconfigPath)
	cluster.Kubeconfig = strings.TrimSpace(cluster.Kubeconfig)
	cluster.Token = strings.TrimSpace(cluster.Token)
	cluster.CAData = strings.TrimSpace(cluster.CAData)

	if cluster.ID == "" {
		cluster.ID = newClusterID(cluster.Name)
	}
	if cluster.Name == "" {
		return nil, fmt.Errorf("cluster name is required")
	}
	if !isSupportedClusterMode(cluster.Mode) {
		return nil, fmt.Errorf("unsupported cluster mode: %s", cluster.Mode)
	}
	if cluster.LastConnectionStatus == "" {
		cluster.LastConnectionStatus = ConnectionStatusUnknown
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	if cluster.IsDefault {
		if _, err = tx.Exec(ctx, `UPDATE clusters SET is_default = FALSE WHERE id <> $1`, cluster.ID); err != nil {
			return nil, err
		}
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO clusters (
			id,
			name,
			mode,
			api_server,
			kubeconfig_path,
			kubeconfig,
			token,
			ca_data,
			insecure_skip_tls_verify,
			is_default,
			is_enabled,
			last_connection_status,
			last_connection_error,
			last_connected_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
		)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			mode = EXCLUDED.mode,
			api_server = EXCLUDED.api_server,
			kubeconfig_path = EXCLUDED.kubeconfig_path,
			kubeconfig = EXCLUDED.kubeconfig,
			token = EXCLUDED.token,
			ca_data = EXCLUDED.ca_data,
			insecure_skip_tls_verify = EXCLUDED.insecure_skip_tls_verify,
			is_default = EXCLUDED.is_default,
			is_enabled = EXCLUDED.is_enabled,
			last_connection_status = EXCLUDED.last_connection_status,
			last_connection_error = EXCLUDED.last_connection_error,
			last_connected_at = EXCLUDED.last_connected_at,
			updated_at = NOW()
		RETURNING
			id,
			name,
			mode,
			api_server,
			kubeconfig_path,
			kubeconfig,
			token,
			ca_data,
			insecure_skip_tls_verify,
			is_default,
			is_enabled,
			last_connection_status,
			last_connection_error,
			last_connected_at,
			created_at,
			updated_at
	`,
		cluster.ID,
		cluster.Name,
		cluster.Mode,
		cluster.APIServer,
		cluster.KubeconfigPath,
		cluster.Kubeconfig,
		cluster.Token,
		cluster.CAData,
		cluster.InsecureSkipTLSVerify,
		cluster.IsDefault,
		cluster.IsEnabled,
		cluster.LastConnectionStatus,
		cluster.LastConnectionError,
		cluster.LastConnectedAt,
	)

	saved, err := scanCluster(row)
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return saved, nil
}

func (s *ClusterStore) List(ctx context.Context) ([]Cluster, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			id,
			name,
			mode,
			api_server,
			kubeconfig_path,
			kubeconfig,
			token,
			ca_data,
			insecure_skip_tls_verify,
			is_default,
			is_enabled,
			last_connection_status,
			last_connection_error,
			last_connected_at,
			created_at,
			updated_at
		FROM clusters
		ORDER BY is_default DESC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clusters []Cluster
	for rows.Next() {
		cluster, err := scanCluster(rows)
		if err != nil {
			return nil, err
		}
		clusters = append(clusters, *cluster)
	}

	return clusters, rows.Err()
}

func (s *ClusterStore) GetByID(ctx context.Context, id string) (*Cluster, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT
			id,
			name,
			mode,
			api_server,
			kubeconfig_path,
			kubeconfig,
			token,
			ca_data,
			insecure_skip_tls_verify,
			is_default,
			is_enabled,
			last_connection_status,
			last_connection_error,
			last_connected_at,
			created_at,
			updated_at
		FROM clusters
		WHERE id = $1
	`, id)

	cluster, err := scanCluster(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}

	return cluster, err
}

func (s *ClusterStore) GetDefault(ctx context.Context) (*Cluster, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT
			id,
			name,
			mode,
			api_server,
			kubeconfig_path,
			kubeconfig,
			token,
			ca_data,
			insecure_skip_tls_verify,
			is_default,
			is_enabled,
			last_connection_status,
			last_connection_error,
			last_connected_at,
			created_at,
			updated_at
		FROM clusters
		WHERE is_default = TRUE
		ORDER BY updated_at DESC
		LIMIT 1
	`)

	cluster, err := scanCluster(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}

	return cluster, err
}

func (s *ClusterStore) UpdateConnectionStatus(
	ctx context.Context,
	id string,
	status string,
	message string,
	connectedAt *time.Time,
) error {
	if status == "" {
		status = ConnectionStatusUnknown
	}

	_, err := s.pool.Exec(ctx, `
		UPDATE clusters
		SET
			last_connection_status = $2,
			last_connection_error = $3,
			last_connected_at = $4,
			updated_at = NOW()
		WHERE id = $1
	`, id, status, message, connectedAt)

	return err
}

func scanCluster(row rowScanner) (*Cluster, error) {
	var cluster Cluster
	err := row.Scan(
		&cluster.ID,
		&cluster.Name,
		&cluster.Mode,
		&cluster.APIServer,
		&cluster.KubeconfigPath,
		&cluster.Kubeconfig,
		&cluster.Token,
		&cluster.CAData,
		&cluster.InsecureSkipTLSVerify,
		&cluster.IsDefault,
		&cluster.IsEnabled,
		&cluster.LastConnectionStatus,
		&cluster.LastConnectionError,
		&cluster.LastConnectedAt,
		&cluster.CreatedAt,
		&cluster.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &cluster, nil
}

func isSupportedClusterMode(mode string) bool {
	switch mode {
	case ClusterModeInCluster, ClusterModeKubeconfig, ClusterModeToken:
		return true
	default:
		return false
	}
}

func newClusterID(name string) string {
	slug := slugify(name)
	if slug == "" {
		slug = "cluster"
	}

	var random [4]byte
	if _, err := rand.Read(random[:]); err != nil {
		return fmt.Sprintf("%s-%d", slug, time.Now().Unix())
	}

	return fmt.Sprintf("%s-%x", slug, random)
}

func slugify(value string) string {
	var builder strings.Builder
	lastHyphen := false

	for _, char := range strings.ToLower(strings.TrimSpace(value)) {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
			lastHyphen = false
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
			lastHyphen = false
		case !lastHyphen:
			builder.WriteRune('-')
			lastHyphen = true
		}
	}

	return strings.Trim(builder.String(), "-")
}
