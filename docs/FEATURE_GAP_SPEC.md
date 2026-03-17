# K8s Agent 功能缺口分析与补充 Spec

## 1. 现有功能完成度总览

经过对前端页面、后端 API 和现有 spec 文档的完整分析，当前项目已具备以下能力：

### ✅ 已完成

| 模块 | 能力 | 前端 | 后端 |
|------|------|:----:|:----:|
| 集群管理 | 多集群接入、切换、连接测试 | ✅ | ✅ |
| 仪表盘 | 概览、资源使用图表、命名空间分布、最近事件、AI 巡检摘要 | ✅ | ✅ |
| 节点管理 | 列表、详情、指标、cordon/uncordon、维护模式 | ✅ | ✅ |
| Pod 管理 | 列表、详情、日志、指标、删除、重启 | ✅ | ✅ |
| 工作负载 | Deployment/StatefulSet/DaemonSet/CronJob 的列表、详情、扩缩容、重启、暂停/恢复、删除 | ✅ | ✅ |
| 命名空间 | 列表、详情 | ✅ | ✅ |
| AI 诊断 | 对话、流式输出、结构化报告、模板系统、主动巡检、问题跟踪、诊断记忆、风险摘要 | ✅ | ✅ |
| 系统设置 | 主题、通知、AI 模型配置 | ✅ | ✅ |
| 审计日志 | 列表、筛选、分页 | ✅ | ✅ |
| 通知中心 | 通知列表、全部已读 | ✅ | ✅ |

---

## 2. 需要补充的功能

综合对比业界标准 K8s 管理平台（Kuboard、Lens、Rancher），以下功能需要补充：

---

### P0：核心 K8s 资源管理缺口

当前项目只覆盖了 Node、Pod、Deployment、StatefulSet、DaemonSet、CronJob、Namespace 七类资源，日常运维中高频使用的以下资源类型完全缺失：

#### 2.1 Service 管理

**缺失原因**：Service 是 K8s 网络的核心抽象，不可缺少。

**需要实现**：
- 后端 CRUD 接口：`GET /api/services`、`GET /api/services/{namespace}/{name}`、`DELETE /api/services/{namespace}/{name}`
- 后端 service 层：通过 K8s client 读取 Service 列表和详情
- 前端 Services 页面：列表（名称、命名空间、类型、ClusterIP、端口、外部端点、创建时间）+ 详情面板（YAML 预览、端口映射、选择器、关联 Endpoints）
- 前端路由：`/services`
- API 定义：`src/lib/api.ts` 增加 `servicesAPI`

#### 2.2 Ingress 管理

**缺失原因**：外部流量入口，故障排查必备。

**需要实现**：
- 后端接口：`GET /api/ingresses`、`GET /api/ingresses/{namespace}/{name}`、`DELETE /api/ingresses/{namespace}/{name}`
- 前端 Ingresses 页面：列表（名称、命名空间、IngressClass、规则、后端、TLS）+ 详情面板
- 前端路由：`/ingresses`

#### 2.3 ConfigMap 管理

**缺失原因**：应用配置管理的核心，排查配置问题必备。

**需要实现**：
- 后端接口：`GET /api/configmaps`、`GET /api/configmaps/{namespace}/{name}`、`DELETE /api/configmaps/{namespace}/{name}`
- 前端 ConfigMaps 页面：列表 + 详情面板（数据键值对展示、只读 YAML 预览）
- 前端路由：`/configmaps`

#### 2.4 Secret 管理（只读）

**缺失原因**：排查认证和证书问题需要，但需限制权限。

**需要实现**：
- 后端接口：`GET /api/secrets`、`GET /api/secrets/{namespace}/{name}`（值做脱敏处理）
- 前端 Secrets 页面：列表（名称、命名空间、类型、数据个数）+ 详情（键名展示，值默认隐藏，点击显示）
- 前端路由：`/secrets`

#### 2.5 PersistentVolumeClaim / PersistentVolume / StorageClass

**缺失原因**：存储问题排查必备，PVC Pending 是高频故障。

**需要实现**：
- 后端接口：
  - `GET /api/pvcs`、`GET /api/pvcs/{namespace}/{name}`
  - `GET /api/pvs`、`GET /api/pvs/{name}`
  - `GET /api/storageclasses`、`GET /api/storageclasses/{name}`
- 新增前端 Storage 页面（含 PVC、PV、StorageClass 三个 Tab）
- 前端路由：`/storage`

#### 2.6 独立事件（Event）页面

**缺失原因**：当前事件只在仪表盘"最近事件"卡片展示 3 条，无法全量查看、筛选、搜索。

**需要实现**：
- 后端接口：`GET /api/events`（支持按命名空间、资源类型、告警级别、时间范围筛选和分页）
- 前端 Events 页面：全量事件表格 + 筛选器 + 时间线视图
- 前端路由：`/events`

#### 2.7 Job 管理

**缺失原因**：当前只有 CronJob，缺少一次性 Job 的管理。

**需要实现**：
- 后端接口：`GET /api/jobs`、`GET /api/jobs/{namespace}/{name}`、`DELETE /api/jobs/{namespace}/{name}`
- Job 可并入 Workloads 页面作为新 Tab
- 也可以单独列为路由 `/jobs`

---

### P1：运维效率提升

#### 2.8 YAML 查看器

**缺失原因**：高级用户和故障排查都需要直接查看资源 YAML。

**需要实现**：
- 所有资源详情面板增加"YAML"标签页
- 后端各资源详情接口返回中可选包含 `rawYaml` 字段（或新增 `GET /api/{resource}/{namespace}/{name}/yaml` 接口）
- 前端集成代码高亮组件（推荐 Monaco Editor 只读模式 或简单 `<pre>` + 语法高亮）

#### 2.9 Pod Exec 终端（WebSocket）

**缺失原因**：调试容器是运维最常见的动作之一，目前必须离开平台到终端执行 `kubectl exec`。

**需要实现**：
- 后端 WebSocket 端点：`WS /api/pods/{namespace}/{name}/exec`
- 转发到 K8s API Server 的 exec SPDY/WebSocket 连接
- 前端集成 xterm.js 终端组件
- 审计：记录每次终端会话

#### 2.10 资源创建向导

**缺失原因**：当前平台只有只读和有限写操作，无法新建 Deployment 等资源。

**需要实现**：
- 支持通过 YAML 编辑器创建资源 `POST /api/apply`
- 前端"新建资源"按钮 → YAML 编辑器 → 预览确认 → Apply
- 审计记录

---

### P2：平台安全与多用户

#### 2.11 用户认证体系

**缺失原因**：当前 `isAuthenticated` 默认为 `true`（硬编码），无实际登录流程。

**需要实现**：
- 后端用户表：`users`（id, username, password_hash, email, role, created_at）
- 后端 JWT 签发：`POST /api/auth/login` → 返回 JWT
- 前端登录页面、Token 存储、请求拦截器加 Authorization Header
- 退出登录清除 Token

#### 2.12 RBAC 权限模型

**缺失原因**：多人使用平台时需要不同权限隔离。

**需要实现**：
- 角色定义：admin / viewer / operator
- 命名空间级别权限
- 后端中间件校验请求的权限
- 前端按角色显示/隐藏操作按钮

---

### P3：可观测性增强

#### 2.13 Prometheus 集成

**缺失原因**：当前资源指标是快照式的，没有真正的历史指标存储。

**需要实现**：
- 后端配置 Prometheus 地址
- 后端查询接口代理 PromQL
- 前端指标面板支持时间范围选择和实时查询

#### 2.14 聚合日志

**缺失原因**：当前只能查看单个 Pod 的日志，无法跨 Pod 搜索。

**需要实现**：
- 集成 Loki 或 Elasticsearch
- 后端日志搜索接口
- 前端日志搜索页面，支持按命名空间、Pod、关键词过滤

---

## 3. 建议实施路线

```
阶段 A（P0 核心资源）
├── Service + Ingress
├── ConfigMap + Secret
├── PVC / PV / StorageClass
├── Event 独立页面
└── Job 管理

阶段 B（P1 运维效率）
├── YAML 查看器
├── Pod Exec 终端
└── 资源创建向导

阶段 C（P2 安全）
├── 用户认证
└── RBAC 权限

阶段 D（P3 可观测性）
├── Prometheus 集成
└── 聚合日志
```

## 4. 推荐最优先实现

如果只能选 **一批** 优先做，建议先做：

1. **Service + Ingress**：补齐网络层管理，与现有 Pod/Workload 形成完整故障排查链路
2. **ConfigMap + Secret**：补齐配置层管理
3. **Event 独立页面**：让事件可检索，大幅提升排障效率
4. **YAML 查看器**：所有资源详情增加 YAML Tab，投入产出比最高
5. **用户认证**：移除硬编码认证，让平台可以真正上线使用

## 5. 与已有 Spec 的关系

| 已有 Spec | 本 Spec 覆盖 |
|-----------|:----------:|
| `AI_AGENT_SPEC.md` — AI 诊断结构化、流式输出、模板 | 不重复，已实现 |
| `AI_INTELLIGENCE_SPEC.md` — 主动巡检、风险摘要、诊断记忆 | 不重复，已实现 |
| `KUBOARD_GAP_ANALYSIS.md` — 对标 Kuboard 缺口 | **本 Spec 是该分析的具体落地方案** |

本 Spec 将 `KUBOARD_GAP_ANALYSIS.md` 中识别的缺口转化为了可直接执行的功能点和接口设计。
