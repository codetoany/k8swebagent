package api

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"

	"k8s-agent-backend/internal/store"
)

func TestRequireClusterConsoleAccess(t *testing.T) {
	adminCtx := context.WithValue(context.Background(), authUserContextKey, store.AuthUser{
		Username: "admin",
		Role:     "admin",
	})
	if err := requireClusterConsoleAccess(adminCtx); err != nil {
		t.Fatalf("requireClusterConsoleAccess(admin) returned error: %v", err)
	}

	operatorCtx := context.WithValue(context.Background(), authUserContextKey, store.AuthUser{
		Username: "operator",
		Role:     "operator",
	})
	if err := requireClusterConsoleAccess(operatorCtx); err != errClusterConsoleAdminOnly {
		t.Fatalf("requireClusterConsoleAccess(operator) = %v, want %v", err, errClusterConsoleAdminOnly)
	}
}

func TestClusterConsoleAuditRecorder(t *testing.T) {
	recorder := &clusterConsoleAuditRecorder{}
	recorder.WriteInput("kubectl get podz\x7fs\r")
	recorder.WriteInput("\x1b[A")
	recorder.WriteInput("kubectl get ns\r")

	got := recorder.Commands()
	want := []string{"kubectl get pods", "kubectl get ns"}

	if len(got) != len(want) {
		t.Fatalf("Commands() length = %d, want %d (%v)", len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("Commands()[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func TestIsNormalClusterConsoleOutputClose(t *testing.T) {
	testcases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "closed", err: os.ErrClosed, want: true},
		{name: "eof", err: io.EOF, want: true},
		{name: "ptmx eio", err: errors.New("read /dev/ptmx: input/output error"), want: true},
		{name: "other", err: errors.New("permission denied"), want: false},
	}

	for _, tc := range testcases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isNormalClusterConsoleOutputClose(tc.err); got != tc.want {
				t.Fatalf("isNormalClusterConsoleOutputClose(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
