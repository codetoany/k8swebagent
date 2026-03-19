package api

import (
	"errors"
	"testing"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestTranslateUpstreamError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
		wantOK     bool
	}{
		{
			name:       "unauthorized kubernetes error",
			err:        k8serrors.NewUnauthorized("bad token"),
			wantStatus: 502,
			wantMsg:    "集群认证失败，请更新集群 Token 或 kubeconfig",
			wantOK:     true,
		},
		{
			name:       "forbidden kubernetes error",
			err:        k8serrors.NewForbidden(schema.GroupResource{Resource: "pods"}, "demo", errors.New("denied")),
			wantStatus: 403,
			wantMsg:    "集群账号权限不足，请检查 RBAC 授权",
			wantOK:     true,
		},
		{
			name:       "string based forbidden error",
			err:        errors.New("request forbidden by upstream"),
			wantStatus: 403,
			wantMsg:    "集群账号权限不足，请检查 RBAC 授权",
			wantOK:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotStatus, gotMsg, gotOK := translateUpstreamError(tt.err)
			if gotStatus != tt.wantStatus || gotMsg != tt.wantMsg || gotOK != tt.wantOK {
				t.Fatalf(
					"translateUpstreamError(%v) = (%d, %q, %v), want (%d, %q, %v)",
					tt.err,
					gotStatus,
					gotMsg,
					gotOK,
					tt.wantStatus,
					tt.wantMsg,
					tt.wantOK,
				)
			}
		})
	}
}
