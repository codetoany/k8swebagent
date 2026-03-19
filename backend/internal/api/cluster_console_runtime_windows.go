//go:build windows

package api

import "errors"

func startClusterConsoleRuntime(spec clusterConsoleRuntimeSpec, cols, rows uint16) (clusterConsoleRuntime, error) {
	return nil, errors.New("cluster console PTY is not supported on windows builds")
}
