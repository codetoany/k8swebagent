package api

import (
	"context"
	"testing"
	"time"

	"k8s-agent-backend/internal/store"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestRequireNodeShellAccess(t *testing.T) {
	adminCtx := context.WithValue(context.Background(), authUserContextKey, store.AuthUser{
		Username: "admin",
		Role:     "admin",
	})
	if err := requireNodeShellAccess(adminCtx); err != nil {
		t.Fatalf("requireNodeShellAccess(admin) returned error: %v", err)
	}

	operatorCtx := context.WithValue(context.Background(), authUserContextKey, store.AuthUser{
		Username: "operator",
		Role:     "operator",
	})
	if err := requireNodeShellAccess(operatorCtx); err != errNodeShellAdminOnly {
		t.Fatalf("requireNodeShellAccess(operator) = %v, want %v", err, errNodeShellAdminOnly)
	}
}

func TestRequestedNodeShellCommand(t *testing.T) {
	got := requestedNodeShellCommand("", "nsenter -t 1 -- /bin/sh")
	want := []string{"/bin/sh", "-lc", "nsenter -t 1 -- /bin/sh"}
	if len(got) != len(want) {
		t.Fatalf("requestedNodeShellCommand length = %d, want %d (%v)", len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("requestedNodeShellCommand()[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func TestPickPreferredHostShellPod(t *testing.T) {
	now := metav1.NewTime(time.Now())

	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "pending-pod"},
			Status:     corev1.PodStatus{Phase: corev1.PodPending},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "running-not-ready"},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				Conditions: []corev1.PodCondition{
					{Type: corev1.PodReady, Status: corev1.ConditionFalse},
				},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "running-ready"},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				Conditions: []corev1.PodCondition{
					{Type: corev1.PodReady, Status: corev1.ConditionTrue},
				},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "terminating-ready",
				DeletionTimestamp: &now,
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				Conditions: []corev1.PodCondition{
					{Type: corev1.PodReady, Status: corev1.ConditionTrue},
				},
			},
		},
	}

	got := pickPreferredHostShellPod(pods)
	if got == nil {
		t.Fatal("pickPreferredHostShellPod() returned nil")
	}
	if got.Name != "running-ready" {
		t.Fatalf("pickPreferredHostShellPod() = %q, want %q", got.Name, "running-ready")
	}
}
