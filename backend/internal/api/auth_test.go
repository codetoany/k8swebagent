package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExtractRequestToken(t *testing.T) {
	t.Run("prefers bearer token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/pods/default/demo/exec?access_token=query-token", nil)
		req.Header.Set("Authorization", "Bearer header-token")

		if got := extractRequestToken(req); got != "header-token" {
			t.Fatalf("extractRequestToken() = %q, want %q", got, "header-token")
		}
	})

	t.Run("falls back to query token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/pods/default/demo/exec?access_token=query-token", nil)

		if got := extractRequestToken(req); got != "query-token" {
			t.Fatalf("extractRequestToken() = %q, want %q", got, "query-token")
		}
	})
}

func TestRequiredPermission(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		want   string
	}{
		{
			name:   "websocket exec requires pod write permission",
			method: http.MethodGet,
			path:   "/api/pods/default/demo/exec",
			want:   "pods:write",
		},
		{
			name:   "pod logs remain read only",
			method: http.MethodGet,
			path:   "/api/pods/default/demo/logs",
			want:   "",
		},
		{
			name:   "cluster console websocket requires cluster console permission",
			method: http.MethodGet,
			path:   "/api/cluster-console/ws",
			want:   "cluster.console",
		},
		{
			name:   "node shell websocket requires node shell permission",
			method: http.MethodGet,
			path:   "/api/nodes/k8s-node01/shell",
			want:   "node.shell",
		},
		{
			name:   "pod restart requires pod write permission",
			method: http.MethodPost,
			path:   "/api/pods/default/demo/restart",
			want:   "pods:write",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := requiredPermission(tt.method, tt.path); got != tt.want {
				t.Fatalf("requiredPermission(%q, %q) = %q, want %q", tt.method, tt.path, got, tt.want)
			}
		})
	}
}
