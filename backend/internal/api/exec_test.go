package api

import (
	"reflect"
	"testing"
)

func TestParseShellCommand(t *testing.T) {
	tests := []struct {
		name string
		cmd  string
		want []string
	}{
		{
			name: "plain command",
			cmd:  "kubectl get pods",
			want: []string{"kubectl", "get", "pods"},
		},
		{
			name: "compound command",
			cmd:  "echo hello | wc -c",
			want: []string{"sh", "-c", "echo hello | wc -c"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseShellCommand(tt.cmd); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("parseShellCommand(%q) = %v, want %v", tt.cmd, got, tt.want)
			}
		})
	}
}
