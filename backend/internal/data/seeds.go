package data

import "encoding/json"

type SnapshotSeed struct {
	Scope   string
	Key     string
	Payload json.RawMessage
}

func mustJSON(raw string) json.RawMessage {
	return json.RawMessage(raw)
}

var SnapshotSeeds = []SnapshotSeed{
	{
		Scope: "auth",
		Key:   "user-info",
		Payload: mustJSON(`{
  "id": "admin",
  "username": "admin",
  "email": "admin@k8s-agent.com",
  "role": "admin",
  "permissions": [
    "dashboard:read",
    "nodes:read",
    "pods:read",
    "workloads:read",
    "settings:read",
    "diagnosis:read"
  ]
}`),
	},
	{
		Scope: "dashboard",
		Key:   "overview",
		Payload: mustJSON(`{
  "totalNodes": 6,
  "onlineNodes": 5,
  "offlineNodes": 1,
  "totalPods": 45,
  "runningPods": 40,
  "failedPods": 2,
  "pausedPods": 3,
  "totalWorkloads": 15,
  "cpuUsage": 65,
  "memoryUsage": 78,
  "diskUsage": 42
}`),
	},
	{
		Scope: "dashboard",
		Key:   "resource-usage",
		Payload: mustJSON(`[
  { "time": "00:00", "cpuUsage": 30, "memoryUsage": 40, "diskUsage": 28 },
  { "time": "04:00", "cpuUsage": 25, "memoryUsage": 35, "diskUsage": 30 },
  { "time": "08:00", "cpuUsage": 45, "memoryUsage": 55, "diskUsage": 33 },
  { "time": "12:00", "cpuUsage": 60, "memoryUsage": 75, "diskUsage": 38 },
  { "time": "16:00", "cpuUsage": 70, "memoryUsage": 80, "diskUsage": 40 },
  { "time": "20:00", "cpuUsage": 55, "memoryUsage": 70, "diskUsage": 41 },
  { "time": "现在", "cpuUsage": 65, "memoryUsage": 78, "diskUsage": 42 }
]`),
	},
	{
		Scope: "dashboard",
		Key:   "recent-events",
		Payload: mustJSON(`[
  {
    "id": "event-1",
    "type": "warning",
    "reason": "NodeNotReady",
    "message": "node-3 已离线，请检查节点网络和 kubelet 状态。",
    "timestamp": "2026-03-13T13:50:00Z",
    "involvedObject": { "kind": "Node", "name": "node-3", "namespace": "default" }
  },
  {
    "id": "event-2",
    "type": "info",
    "reason": "PodScheduled",
    "message": "web-app-789df 已成功调度到 node-1。",
    "timestamp": "2026-03-13T13:30:00Z",
    "involvedObject": { "kind": "Pod", "name": "web-app-789df", "namespace": "default" }
  },
  {
    "id": "event-3",
    "type": "error",
    "reason": "ErrImagePull",
    "message": "broken-pod-456ij 拉取镜像失败。",
    "timestamp": "2026-03-13T13:15:00Z",
    "involvedObject": { "kind": "Pod", "name": "broken-pod-456ij", "namespace": "default" }
  },
  {
    "id": "event-4",
    "type": "success",
    "reason": "DeploymentUpdated",
    "message": "api-server Deployment 已完成滚动更新。",
    "timestamp": "2026-03-13T12:50:00Z",
    "involvedObject": { "kind": "Deployment", "name": "api-server", "namespace": "default" }
  }
]`),
	},
	{
		Scope: "dashboard",
		Key:   "namespace-distribution",
		Payload: mustJSON(`[
  { "name": "default", "value": 12 },
  { "name": "kube-system", "value": 18 },
  { "name": "kube-public", "value": 3 },
  { "name": "dev", "value": 8 },
  { "name": "prod", "value": 15 }
]`),
	},
	{
		Scope: "nodes",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "node-1",
    "name": "node-1",
    "status": "online",
    "cpuUsage": 65,
    "memoryUsage": 78,
    "pods": 12,
    "ip": "192.168.1.101",
    "os": "Ubuntu 22.04",
    "kernelVersion": "5.15.0-86-generic",
    "kubeletVersion": "v1.28.0",
    "capacity": { "cpu": "8", "memory": "32Gi", "pods": "110" },
    "allocatable": { "cpu": "7.9", "memory": "31Gi", "pods": "110" },
    "labels": {
      "kubernetes.io/hostname": "node-1",
      "node-role.kubernetes.io/worker": ""
    },
    "taints": []
  },
  {
    "id": "node-2",
    "name": "node-2",
    "status": "online",
    "cpuUsage": 45,
    "memoryUsage": 62,
    "pods": 10,
    "ip": "192.168.1.102",
    "os": "Ubuntu 22.04",
    "kernelVersion": "5.15.0-86-generic",
    "kubeletVersion": "v1.28.0",
    "capacity": { "cpu": "8", "memory": "32Gi", "pods": "110" },
    "allocatable": { "cpu": "7.9", "memory": "31Gi", "pods": "110" },
    "labels": {
      "kubernetes.io/hostname": "node-2",
      "node-role.kubernetes.io/worker": ""
    },
    "taints": []
  },
  {
    "id": "node-3",
    "name": "node-3",
    "status": "offline",
    "cpuUsage": 0,
    "memoryUsage": 0,
    "pods": 8,
    "ip": "192.168.1.103",
    "os": "Ubuntu 22.04",
    "kernelVersion": "5.15.0-86-generic",
    "kubeletVersion": "v1.28.0",
    "capacity": { "cpu": "8", "memory": "32Gi", "pods": "110" },
    "allocatable": { "cpu": "7.9", "memory": "31Gi", "pods": "110" },
    "labels": {
      "kubernetes.io/hostname": "node-3",
      "node-role.kubernetes.io/worker": ""
    },
    "taints": []
  },
  {
    "id": "node-4",
    "name": "node-4",
    "status": "online",
    "cpuUsage": 30,
    "memoryUsage": 45,
    "pods": 7,
    "ip": "192.168.1.104",
    "os": "Ubuntu 22.04",
    "kernelVersion": "5.15.0-86-generic",
    "kubeletVersion": "v1.28.0",
    "capacity": { "cpu": "8", "memory": "32Gi", "pods": "110" },
    "allocatable": { "cpu": "7.9", "memory": "31Gi", "pods": "110" },
    "labels": {
      "kubernetes.io/hostname": "node-4",
      "node-role.kubernetes.io/worker": ""
    },
    "taints": []
  },
  {
    "id": "node-5",
    "name": "node-5",
    "status": "online",
    "cpuUsage": 55,
    "memoryUsage": 68,
    "pods": 9,
    "ip": "192.168.1.105",
    "os": "Ubuntu 22.04",
    "kernelVersion": "5.15.0-86-generic",
    "kubeletVersion": "v1.28.0",
    "capacity": { "cpu": "8", "memory": "32Gi", "pods": "110" },
    "allocatable": { "cpu": "7.9", "memory": "31Gi", "pods": "110" },
    "labels": {
      "kubernetes.io/hostname": "node-5",
      "node-role.kubernetes.io/worker": ""
    },
    "taints": []
  },
  {
    "id": "node-6",
    "name": "node-6",
    "status": "online",
    "cpuUsage": 25,
    "memoryUsage": 35,
    "pods": 6,
    "ip": "192.168.1.106",
    "os": "Ubuntu 22.04",
    "kernelVersion": "5.15.0-86-generic",
    "kubeletVersion": "v1.28.0",
    "capacity": { "cpu": "8", "memory": "32Gi", "pods": "110" },
    "allocatable": { "cpu": "7.9", "memory": "31Gi", "pods": "110" },
    "labels": {
      "kubernetes.io/hostname": "node-6",
      "node-role.kubernetes.io/worker": ""
    },
    "taints": []
  }
]`),
	},
	{
		Scope: "nodes",
		Key:   "metrics",
		Payload: mustJSON(`{
  "node-1": {
    "cpuUsage": 65,
    "memoryUsage": 78,
    "diskUsage": 40,
    "networkReceive": 322,
    "networkTransmit": 215,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "node-2": {
    "cpuUsage": 45,
    "memoryUsage": 62,
    "diskUsage": 35,
    "networkReceive": 268,
    "networkTransmit": 182,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "node-3": {
    "cpuUsage": 0,
    "memoryUsage": 0,
    "diskUsage": 0,
    "networkReceive": 0,
    "networkTransmit": 0,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "node-4": {
    "cpuUsage": 30,
    "memoryUsage": 45,
    "diskUsage": 28,
    "networkReceive": 173,
    "networkTransmit": 121,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "node-5": {
    "cpuUsage": 55,
    "memoryUsage": 68,
    "diskUsage": 38,
    "networkReceive": 294,
    "networkTransmit": 207,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "node-6": {
    "cpuUsage": 25,
    "memoryUsage": 35,
    "diskUsage": 22,
    "networkReceive": 131,
    "networkTransmit": 97,
    "timestamp": "2026-03-13T14:00:00Z"
  }
}`),
	},
	{
		Scope: "pods",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "web-app-789df",
    "name": "web-app-789df",
    "namespace": "default",
    "status": "running",
    "node": "node-1",
    "ip": "10.244.1.10",
    "containers": [
      { "name": "web-app", "ready": true, "restartCount": 0, "image": "nginx:1.23" },
      { "name": "sidecar", "ready": true, "restartCount": 0, "image": "busybox:latest" }
    ],
    "age": "5d",
    "cpuUsage": 12,
    "memoryUsage": 256,
    "labels": { "app": "web-app", "version": "v1" }
  },
  {
    "id": "api-server-567gh",
    "name": "api-server-567gh",
    "namespace": "default",
    "status": "running",
    "node": "node-2",
    "ip": "10.244.2.15",
    "containers": [
      { "name": "api-server", "ready": true, "restartCount": 1, "image": "my-api:v2.1.0" }
    ],
    "age": "3d",
    "cpuUsage": 45,
    "memoryUsage": 1024,
    "labels": { "app": "api-server", "environment": "production" }
  },
  {
    "id": "database-123ab",
    "name": "database-123ab",
    "namespace": "default",
    "status": "running",
    "node": "node-3",
    "ip": "10.244.3.20",
    "containers": [
      { "name": "postgres", "ready": true, "restartCount": 0, "image": "postgres:14" }
    ],
    "age": "7d",
    "cpuUsage": 28,
    "memoryUsage": 2048,
    "labels": { "app": "database", "db": "postgres" }
  },
  {
    "id": "worker-456cd",
    "name": "worker-456cd",
    "namespace": "default",
    "status": "running",
    "node": "node-4",
    "ip": "10.244.4.25",
    "containers": [
      { "name": "worker", "ready": true, "restartCount": 2, "image": "worker:v1.3.0" }
    ],
    "age": "2d",
    "cpuUsage": 75,
    "memoryUsage": 512,
    "labels": { "app": "worker", "queue": "tasks" }
  },
  {
    "id": "monitoring-789ef",
    "name": "monitoring-789ef",
    "namespace": "kube-system",
    "status": "running",
    "node": "node-5",
    "ip": "10.244.5.30",
    "containers": [
      { "name": "prometheus", "ready": true, "restartCount": 0, "image": "prometheus:latest" },
      { "name": "grafana", "ready": true, "restartCount": 0, "image": "grafana:latest" }
    ],
    "age": "10d",
    "cpuUsage": 18,
    "memoryUsage": 768,
    "labels": { "app": "monitoring", "component": "metrics" }
  },
  {
    "id": "cron-job-123gh",
    "name": "cron-job-123gh",
    "namespace": "default",
    "status": "succeeded",
    "node": "node-6",
    "ip": "10.244.6.35",
    "containers": [
      { "name": "cron-task", "ready": false, "restartCount": 0, "image": "cron-job:v1.0.0" }
    ],
    "age": "1h",
    "cpuUsage": 5,
    "memoryUsage": 128,
    "labels": { "app": "cron-job", "schedule": "hourly" }
  },
  {
    "id": "broken-pod-456ij",
    "name": "broken-pod-456ij",
    "namespace": "default",
    "status": "failed",
    "node": "node-1",
    "ip": "10.244.1.40",
    "containers": [
      { "name": "faulty-app", "ready": false, "restartCount": 15, "image": "faulty-app:v1.0.0" }
    ],
    "age": "30m",
    "cpuUsage": 0,
    "memoryUsage": 0,
    "labels": { "app": "broken-app", "test": "failure" }
  },
  {
    "id": "paused-pod-789kl",
    "name": "paused-pod-789kl",
    "namespace": "dev",
    "status": "paused",
    "node": "node-2",
    "ip": "10.244.2.45",
    "containers": [
      { "name": "test-app", "ready": false, "restartCount": 0, "image": "test-app:v0.1.0" }
    ],
    "age": "2d",
    "cpuUsage": 0,
    "memoryUsage": 0,
    "labels": { "app": "test-app", "environment": "development" }
  }
]`),
	},
	{
		Scope: "pods",
		Key:   "metrics",
		Payload: mustJSON(`{
  "default/web-app-789df": {
    "cpuUsage": 12,
    "memoryUsage": 256,
    "diskUsage": 18,
    "networkReceive": 41,
    "networkTransmit": 29,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "default/api-server-567gh": {
    "cpuUsage": 45,
    "memoryUsage": 1024,
    "diskUsage": 33,
    "networkReceive": 88,
    "networkTransmit": 74,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "default/database-123ab": {
    "cpuUsage": 28,
    "memoryUsage": 2048,
    "diskUsage": 52,
    "networkReceive": 25,
    "networkTransmit": 22,
    "timestamp": "2026-03-13T14:00:00Z"
  },
  "default/worker-456cd": {
    "cpuUsage": 75,
    "memoryUsage": 512,
    "diskUsage": 21,
    "networkReceive": 62,
    "networkTransmit": 58,
    "timestamp": "2026-03-13T14:00:00Z"
  }
}`),
	},
	{
		Scope: "pods",
		Key:   "logs",
		Payload: mustJSON(`{
  "default/web-app-789df": [
    { "timestamp": "2026-03-13T13:49:00Z", "stream": "stdout", "message": "nginx started successfully" },
    { "timestamp": "2026-03-13T13:50:00Z", "stream": "stdout", "message": "GET /healthz 200" }
  ],
  "default/api-server-567gh": [
    { "timestamp": "2026-03-13T13:40:00Z", "stream": "stdout", "message": "server listening on :8080" },
    { "timestamp": "2026-03-13T13:45:00Z", "stream": "stdout", "message": "handled request GET /api/metrics" }
  ],
  "default/broken-pod-456ij": [
    { "timestamp": "2026-03-13T13:10:00Z", "stream": "stderr", "message": "failed to pull image faulty-app:v1.0.0" },
    { "timestamp": "2026-03-13T13:11:00Z", "stream": "stderr", "message": "ErrImagePull: repository does not exist" }
  ]
}`),
	},
	{
		Scope: "deployments",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "web-app-deployment",
    "name": "web-app",
    "namespace": "default",
    "ready": 3,
    "desired": 3,
    "available": 3,
    "upToDate": 3,
    "age": "5d",
    "images": ["nginx:1.23"],
    "labels": { "app": "web-app", "version": "v1" },
    "selector": { "app": "web-app" },
    "strategy": "RollingUpdate"
  },
  {
    "id": "api-server-deployment",
    "name": "api-server",
    "namespace": "default",
    "ready": 2,
    "desired": 2,
    "available": 2,
    "upToDate": 2,
    "age": "3d",
    "images": ["my-api:v2.1.0"],
    "labels": { "app": "api-server", "environment": "production" },
    "selector": { "app": "api-server" },
    "strategy": "RollingUpdate"
  },
  {
    "id": "monitoring-deployment",
    "name": "monitoring",
    "namespace": "kube-system",
    "ready": 1,
    "desired": 1,
    "available": 1,
    "upToDate": 1,
    "age": "10d",
    "images": ["prometheus:latest", "grafana:latest"],
    "labels": { "app": "monitoring", "component": "metrics" },
    "selector": { "app": "monitoring" },
    "strategy": "RollingUpdate"
  }
]`),
	},
	{
		Scope: "statefulsets",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "database-statefulset",
    "name": "database",
    "namespace": "default",
    "ready": 1,
    "desired": 1,
    "available": 1,
    "upToDate": 1,
    "age": "7d",
    "images": ["postgres:14"],
    "labels": { "app": "database", "db": "postgres" },
    "selector": { "app": "database" },
    "serviceName": "database-service"
  }
]`),
	},
	{
		Scope: "daemonsets",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "worker-daemonset",
    "name": "worker",
    "namespace": "default",
    "ready": 6,
    "desired": 6,
    "available": 5,
    "upToDate": 5,
    "age": "2d",
    "images": ["worker:v1.3.0"],
    "labels": { "app": "worker", "queue": "tasks" },
    "selector": { "app": "worker" }
  }
]`),
	},
	{
		Scope: "cronjobs",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "daily-backup-cronjob",
    "name": "daily-backup",
    "namespace": "default",
    "schedule": "0 2 * * *",
    "lastSchedule": "24h ago",
    "age": "14d",
    "images": ["backup-tool:v2.0.0"],
    "labels": { "app": "backup", "schedule": "daily" }
  }
]`),
	},
	{
		Scope: "namespaces",
		Key:   "list",
		Payload: mustJSON(`[
  {
    "id": "default",
    "name": "default",
    "status": "Active",
    "createdAt": "2026-03-01",
    "labels": { "kubernetes.io/metadata.name": "default" }
  },
  {
    "id": "kube-system",
    "name": "kube-system",
    "status": "Active",
    "createdAt": "2026-03-01",
    "labels": { "kubernetes.io/metadata.name": "kube-system" }
  },
  {
    "id": "kube-public",
    "name": "kube-public",
    "status": "Active",
    "createdAt": "2026-03-01",
    "labels": { "kubernetes.io/metadata.name": "kube-public" }
  },
  {
    "id": "dev",
    "name": "dev",
    "status": "Active",
    "createdAt": "2026-03-05",
    "labels": { "team": "platform" }
  },
  {
    "id": "prod",
    "name": "prod",
    "status": "Active",
    "createdAt": "2026-03-05",
    "labels": { "team": "business" }
  }
]`),
	},
	{
		Scope: "settings",
		Key:   "system",
		Payload: mustJSON(`{
  "theme": "system",
  "language": "zh-CN",
  "autoRefreshInterval": 30,
  "showResourceUsage": true,
  "showEvents": true,
  "notifications": {
    "level": "all",
    "enabledTypes": ["node", "pod", "workload", "issue"]
  }
}`),
	},
	{
		Scope: "settings",
		Key:   "ai-models",
		Payload: mustJSON(`[
  {
    "id": "openai-gpt4o",
    "name": "OpenAI GPT-4o",
    "apiBaseUrl": "https://api.openai.com/v1",
    "modelType": "openai",
    "isDefault": true
  },
  {
    "id": "anthropic-claude3",
    "name": "Anthropic Claude 3",
    "apiBaseUrl": "https://api.anthropic.com/v1",
    "modelType": "anthropic",
    "isDefault": false
  }
]`),
	},
	{
		Scope: "ai-diagnosis",
		Key:   "history",
		Payload: mustJSON(`[
  {
    "id": "history-1",
    "title": "分析集群状态",
    "date": "2026-03-12T10:00:00Z",
    "summary": "整体状态良好，但 node-3 离线，建议优先检查节点心跳与网络连通性。"
  },
  {
    "id": "history-2",
    "title": "分析 Pod 失败原因",
    "date": "2026-03-11T09:30:00Z",
    "summary": "broken-pod-456ij 失败原因为镜像拉取失败，建议确认镜像地址与仓库认证。"
  },
  {
    "id": "history-3",
    "title": "提供工作负载优化建议",
    "date": "2026-03-10T08:15:00Z",
    "summary": "api-server 建议启用 HPA，database 建议配置 PodDisruptionBudget。"
  }
]`),
	},
	{
		Scope: "ai-diagnosis",
		Key:   "node-status",
		Payload: mustJSON(`[
  { "name": "node-1", "status": "online", "cpuUsage": 65, "memoryUsage": 78, "pods": 12 },
  { "name": "node-2", "status": "online", "cpuUsage": 45, "memoryUsage": 62, "pods": 10 },
  { "name": "node-3", "status": "offline", "cpuUsage": 0, "memoryUsage": 0, "pods": 8 },
  { "name": "node-4", "status": "online", "cpuUsage": 30, "memoryUsage": 45, "pods": 7 },
  { "name": "node-5", "status": "online", "cpuUsage": 55, "memoryUsage": 68, "pods": 9 },
  { "name": "node-6", "status": "online", "cpuUsage": 25, "memoryUsage": 35, "pods": 6 }
]`),
	},
}
