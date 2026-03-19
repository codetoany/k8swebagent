//go:build !windows

package api

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

type unixClusterConsoleRuntime struct {
	cmd              *exec.Cmd
	ptyFile          *os.File
	tempDir          string
	killProcessGroup bool
	closeOnce        sync.Once
}

func startClusterConsoleRuntime(spec clusterConsoleRuntimeSpec, cols, rows uint16) (clusterConsoleRuntime, error) {
	shellPath, err := exec.LookPath(strings.TrimSpace(spec.ShellPath))
	if err != nil {
		return nil, fmt.Errorf("shell not found: %w", err)
	}

	kubectlPath, err := exec.LookPath(strings.TrimSpace(spec.KubectlPath))
	if err != nil {
		return nil, fmt.Errorf("kubectl not found: %w", err)
	}

	tempDir, err := os.MkdirTemp("", "k8s-agent-console-*")
	if err != nil {
		return nil, err
	}

	if err := os.WriteFile(filepath.Join(tempDir, "config"), spec.Kubeconfig, 0o600); err != nil {
		_ = os.RemoveAll(tempDir)
		return nil, err
	}

	envPath := os.Getenv("PATH")
	if kubectlPath != "kubectl" {
		wrapper := filepath.Join(tempDir, "kubectl")
		script := fmt.Sprintf("#!/bin/sh\nexec %q \"$@\"\n", kubectlPath)
		if err := os.WriteFile(wrapper, []byte(script), 0o700); err != nil {
			_ = os.RemoveAll(tempDir)
			return nil, err
		}
		envPath = tempDir + string(os.PathListSeparator) + envPath
	}

	winsize := &pty.Winsize{
		Cols: uint16(maxUint16(cols, defaultExecCols)),
		Rows: uint16(maxUint16(rows, defaultExecRows)),
	}

	cmd := buildClusterConsoleCommand(shellPath, tempDir, envPath, spec, true)
	ptyFile, err := pty.StartWithSize(cmd, winsize)
	killProcessGroup := true
	if err != nil && shouldRetryClusterConsoleWithoutSetpgid(err) {
		cmd = buildClusterConsoleCommand(shellPath, tempDir, envPath, spec, false)
		ptyFile, err = pty.StartWithSize(cmd, winsize)
		killProcessGroup = false
	}
	if err != nil {
		_ = os.RemoveAll(tempDir)
		return nil, err
	}

	return &unixClusterConsoleRuntime{
		cmd:              cmd,
		ptyFile:          ptyFile,
		tempDir:          tempDir,
		killProcessGroup: killProcessGroup,
	}, nil
}

func buildClusterConsoleCommand(shellPath, tempDir, envPath string, spec clusterConsoleRuntimeSpec, setProcessGroup bool) *exec.Cmd {
	cmd := exec.Command(shellPath, "-i")
	cmd.Dir = tempDir
	cmd.Env = append(os.Environ(),
		"HOME="+tempDir,
		"KUBECONFIG="+filepath.Join(tempDir, "config"),
		"K8S_CLUSTER_ID="+spec.ClusterID,
		"K8S_CLUSTER_NAME="+spec.ClusterName,
		"K8S_NAMESPACE="+spec.Namespace,
		"TERM=xterm-256color",
		"PATH="+envPath,
		fmt.Sprintf("PS1=(%s/%s) \\w $ ", spec.ClusterName, spec.Namespace),
	)
	if setProcessGroup {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}
	return cmd
}

func shouldRetryClusterConsoleWithoutSetpgid(err error) bool {
	return errors.Is(err, syscall.EPERM) || strings.Contains(strings.ToLower(err.Error()), "operation not permitted")
}

func (r *unixClusterConsoleRuntime) Read(p []byte) (int, error) {
	return r.ptyFile.Read(p)
}

func (r *unixClusterConsoleRuntime) Write(p []byte) (int, error) {
	return r.ptyFile.Write(p)
}

func (r *unixClusterConsoleRuntime) Resize(cols, rows uint16) error {
	return pty.Setsize(r.ptyFile, &pty.Winsize{
		Cols: uint16(maxUint16(cols, defaultExecCols)),
		Rows: uint16(maxUint16(rows, defaultExecRows)),
	})
}

func (r *unixClusterConsoleRuntime) Wait() clusterConsoleWaitResult {
	err := r.cmd.Wait()
	exitCode := 0
	if r.cmd.ProcessState != nil {
		exitCode = r.cmd.ProcessState.ExitCode()
	} else if err != nil {
		exitCode = exitCodeFromError(err)
	}
	return clusterConsoleWaitResult{
		ExitCode: exitCode,
		Err:      err,
	}
}

func (r *unixClusterConsoleRuntime) Close() error {
	var closeErr error
	r.closeOnce.Do(func() {
		if r.ptyFile != nil {
			closeErr = r.ptyFile.Close()
		}
		if r.cmd != nil && r.cmd.Process != nil {
			if r.killProcessGroup {
				_ = syscall.Kill(-r.cmd.Process.Pid, syscall.SIGKILL)
			} else {
				_ = r.cmd.Process.Kill()
			}
		}
		if r.tempDir != "" {
			_ = os.RemoveAll(r.tempDir)
		}
	})
	return closeErr
}

func maxUint16(value, fallback uint16) uint16 {
	if value == 0 {
		return fallback
	}
	return value
}
