# AI 观测后端接入说明

当前项目已经支持将 AI 问题中心中的“历史指标视角”和“聚合日志快照”切换到真实观测后端。

## 支持的后端

- Prometheus：用于历史 CPU / 内存指标
- Loki：用于聚合日志快照

## 配置方式

在部署目录的 `.env` 中补充以下变量，然后重建 `k8s-agent-api`：

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

说明：

- `OBSERVABILITY_PROMETHEUS_CPU_QUERY` 和 `OBSERVABILITY_PROMETHEUS_MEMORY_QUERY` 留空时，会使用后端默认查询。
- `OBSERVABILITY_LOKI_QUERY_TEMPLATE` 中的第一个 `%s` 会替换为命名空间，第二个 `%s` 会替换为 Pod 名称前缀。
- 如果未配置 Prometheus / Loki，系统会自动回退到快照数据，不会影响页面可用性。

## 重建服务

```bash
cd /home/soft/k8s/k8sAgent
docker-compose up -d --build k8s-agent-api
```

## 验证接口

指标接口：

```bash
curl "http://127.0.0.1/api/ai-diagnosis/metrics/history?range=today"
```

日志接口：

```bash
curl "http://127.0.0.1/api/ai-diagnosis/logs/aggregate?limit=2"
```

## 当前行为

- 已配置 Prometheus：优先使用真实历史指标
- 已配置 Loki：优先使用真实日志聚合
- 未配置或上游失败：自动回退到当前系统快照
