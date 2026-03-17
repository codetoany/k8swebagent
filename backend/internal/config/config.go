package config

import (
	"os"
	"strconv"
)

type PGConfig struct {
	Host     string
	Port     int
	Database string
	User     string
	Password string
}

type RedisConfig struct {
	Enabled    bool
	URL        string
	TTLSeconds int
}

type K8sBootstrapConfig struct {
	Mode                  string
	Name                  string
	Kubeconfig            string
	KubeconfigPath        string
	APIServer             string
	Token                 string
	CAData                string
	InsecureSkipTLSVerify bool
}

type K8sConfig struct {
	RequestTimeoutSeconds int
	Bootstrap             K8sBootstrapConfig
}

type AIConfig struct {
	InspectionIntervalSeconds     int
	InspectionStartupDelaySeconds int
}

type ObservabilityConfig struct {
	TimeoutSeconds        int
	PrometheusURL         string
	PrometheusToken       string
	PrometheusCPUQuery    string
	PrometheusMemoryQuery string
	LokiURL               string
	LokiToken             string
	LokiQueryTemplate     string
}

type Config struct {
	Port          int
	PG            PGConfig
	Redis         RedisConfig
	K8s           K8sConfig
	AI            AIConfig
	Observability ObservabilityConfig
}

func Load() Config {
	return Config{
		Port: toInt(os.Getenv("PORT"), 8080),
		PG: PGConfig{
			Host:     toString(os.Getenv("POSTGRES_HOST"), "postgres"),
			Port:     toInt(os.Getenv("POSTGRES_PORT"), 5432),
			Database: toString(os.Getenv("POSTGRES_DB"), "k8s_agent"),
			User:     toString(os.Getenv("POSTGRES_USER"), "k8s_agent"),
			Password: toString(os.Getenv("POSTGRES_PASSWORD"), "k8s_agent"),
		},
		Redis: RedisConfig{
			Enabled:    toBool(os.Getenv("REDIS_ENABLED"), true),
			URL:        toString(os.Getenv("REDIS_URL"), "redis://redis:6379"),
			TTLSeconds: toInt(os.Getenv("REDIS_TTL_SECONDS"), 60),
		},
		K8s: K8sConfig{
			RequestTimeoutSeconds: toInt(os.Getenv("K8S_REQUEST_TIMEOUT_SECONDS"), 10),
			Bootstrap: K8sBootstrapConfig{
				Mode:                  toString(os.Getenv("K8S_BOOTSTRAP_MODE"), ""),
				Name:                  toString(os.Getenv("K8S_BOOTSTRAP_NAME"), "Default Cluster"),
				Kubeconfig:            toString(os.Getenv("K8S_BOOTSTRAP_KUBECONFIG"), ""),
				KubeconfigPath:        toString(os.Getenv("K8S_BOOTSTRAP_KUBECONFIG_PATH"), ""),
				APIServer:             toString(os.Getenv("K8S_BOOTSTRAP_API_SERVER"), ""),
				Token:                 toString(os.Getenv("K8S_BOOTSTRAP_TOKEN"), ""),
				CAData:                toString(os.Getenv("K8S_BOOTSTRAP_CA_DATA"), ""),
				InsecureSkipTLSVerify: toBool(os.Getenv("K8S_BOOTSTRAP_INSECURE_SKIP_TLS_VERIFY"), false),
			},
		},
		AI: AIConfig{
			InspectionIntervalSeconds:     toInt(os.Getenv("AI_INSPECTION_INTERVAL_SECONDS"), 600),
			InspectionStartupDelaySeconds: toInt(os.Getenv("AI_INSPECTION_STARTUP_DELAY_SECONDS"), 15),
		},
		Observability: ObservabilityConfig{
			TimeoutSeconds:        toInt(os.Getenv("OBSERVABILITY_TIMEOUT_SECONDS"), 15),
			PrometheusURL:         toString(os.Getenv("OBSERVABILITY_PROMETHEUS_URL"), ""),
			PrometheusToken:       toString(os.Getenv("OBSERVABILITY_PROMETHEUS_TOKEN"), ""),
			PrometheusCPUQuery:    toString(os.Getenv("OBSERVABILITY_PROMETHEUS_CPU_QUERY"), `avg(100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))`),
			PrometheusMemoryQuery: toString(os.Getenv("OBSERVABILITY_PROMETHEUS_MEMORY_QUERY"), `100 * (1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)))`),
			LokiURL:               toString(os.Getenv("OBSERVABILITY_LOKI_URL"), ""),
			LokiToken:             toString(os.Getenv("OBSERVABILITY_LOKI_TOKEN"), ""),
			LokiQueryTemplate:     toString(os.Getenv("OBSERVABILITY_LOKI_QUERY_TEMPLATE"), `{namespace="%s", pod=~"%s.*"}`),
		},
	}
}

func toInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func toBool(value string, fallback bool) bool {
	if value == "" {
		return fallback
	}

	return value == "true" || value == "1"
}

func toString(value string, fallback string) string {
	if value == "" {
		return fallback
	}

	return value
}
