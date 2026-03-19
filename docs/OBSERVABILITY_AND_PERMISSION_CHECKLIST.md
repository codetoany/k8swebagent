# 权限与观测接入清单

## Kubernetes RBAC 覆盖范围

当前 `deploy/k8s-agent-pod-operator-rbac.yaml` 已按 A + B + C 阶段预留扩展，覆盖以下资源能力：

- 核心资源读取与管理：
  - `pods`
  - `services`
  - `configmaps`
  - `secrets`
  - `persistentvolumeclaims`
  - `persistentvolumes`
  - `namespaces`
  - `nodes`
  - `events`
  - `serviceaccounts`
- 工作负载：
  - `deployments`
  - `statefulsets`
  - `daemonsets`
  - `replicasets`
  - `jobs`
  - `cronjobs`
- 网络与存储：
  - `ingresses`
  - `storageclasses`
  - `endpoints`
  - `endpointslices`
- 平台 RBAC 资源：
  - `roles`
  - `rolebindings`
  - `clusterroles`
  - `clusterrolebindings`
- 子资源与特殊动作：
  - `pods/log`
  - `pods/exec`

## 建议动词范围

当前清单已为大多数 A/B/C 场景预留如下能力：

- 只读：`get` `list` `watch`
- 修改：`create` `update` `patch` `delete`

说明：
- `pods/exec` 使用 `create`
- `storageclasses` 当前仅保留只读
- 如果后续要在平台里直接创建或修改 `storageclasses`，需要再加写权限

## D 阶段非 Kubernetes 权限

D 阶段主要不是 Kubernetes RBAC，而是外部观测系统访问权限。

### D1 Prometheus

需要：

- 可访问的 `OBSERVABILITY_PROMETHEUS_URL`
- 对 Prometheus HTTP API 的查询权限
- 如果 Prometheus 开启鉴权：
  - `OBSERVABILITY_PROMETHEUS_TOKEN`

建议最小能力：

- 允许访问查询接口
  - `/api/v1/query`
  - `/api/v1/query_range`

### D2 Loki

需要：

- 可访问的 `OBSERVABILITY_LOKI_URL`
- 对 Loki 查询接口的读取权限
- 如果 Loki 开启鉴权：
  - `OBSERVABILITY_LOKI_TOKEN`

建议最小能力：

- 允许访问查询接口
  - `/loki/api/v1/query`
  - `/loki/api/v1/query_range`

### 如果接 Elasticsearch

若后续 D2 改接 Elasticsearch，而不是 Loki，建议准备：

- ES 只读账号
- 允许读取目标索引
- 允许执行搜索查询

建议最小索引权限：

- `read`
- `view_index_metadata`

## 推荐一次性操作

### 1. 应用 Kubernetes RBAC

```bash
kubectl apply -f E:\code\devops\k8s\k8sAgent\deploy\k8s-agent-pod-operator-rbac.yaml
```

### 2. 配置观测环境变量

在部署目录 `.env` 中配置：

```env
OBSERVABILITY_TIMEOUT_SECONDS=15
OBSERVABILITY_PROMETHEUS_URL=http://prometheus.example.com
OBSERVABILITY_PROMETHEUS_TOKEN=
OBSERVABILITY_PROMETHEUS_CPU_QUERY=
OBSERVABILITY_PROMETHEUS_MEMORY_QUERY=
OBSERVABILITY_LOKI_URL=http://loki.example.com
OBSERVABILITY_LOKI_TOKEN=
OBSERVABILITY_LOKI_QUERY_TEMPLATE={namespace="%s", pod=~"%s.*"}
```

### 3. 重建后端

```bash
cd /home/soft/k8s/k8sAgent
docker-compose up -d --build k8s-agent-api
```

## 备注

- 当前这份清单目标是一次覆盖 A + B + C 的大部分 Kubernetes 侧需求。
- D 阶段的关键不在 Kubernetes RBAC，而在 Prometheus / Loki / ES 的访问凭据与网络可达性。
