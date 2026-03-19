# K8s Agent 功能任务清单

更新时间：2026-03-19

## 使用说明

- 本文档用于记录当前功能范围、完成状态和后续待办。
- 功能完成后，将对应条目标记为 `[x]`。
- 若某项暂不推进，会在条目后明确标注“暂缓”或“依赖外部条件”。
- 当前决议：`D2 聚合日志` 暂不接入，不作为近期交付目标。

## 阶段状态

- [x] 阶段 A：P0 核心 K8s 资源管理
- [x] 阶段 B：P1 运维效率提升
- [x] 阶段 C：P2 平台安全
- [ ] 阶段 D：P3 可观测性增强
- [ ] 阶段 E：P4 管理员终端与命令台

---

## 阶段 A：P0 核心 K8s 资源管理

### A1 — Service 管理

- [x] 后端：Service 列表、详情、删除接口
- [x] 前端：Service 类型、API、页面、路由与导航
- [x] 验证：远端集群接口已通过

### A2 — Ingress 管理

- [x] 后端：Ingress 列表、详情、删除接口
- [x] 前端：Ingress 类型、API、页面、路由与导航
- [x] 验证：远端集群接口已通过

### A3 — ConfigMap 管理

- [x] 后端：ConfigMap 列表、详情、删除接口
- [x] 前端：ConfigMap 类型、API、页面、路由与导航
- [x] 验证：远端集群接口已通过

### A4 — Secret 管理（只读）

- [x] 后端：Secret 列表、详情接口，值脱敏返回
- [x] 前端：Secret 类型、API、页面、路由与导航
- [x] 验证：远端集群接口已通过

### A5 — 存储管理（PVC / PV / StorageClass）

- [x] 后端：PVC、PV、StorageClass 列表与详情接口
- [x] 前端：存储页面、Tab 切换、API、类型、路由
- [x] 验证：PVC 已返回真实数据
- [x] 验证：PV、StorageClass 在当前集群为空时可正常展示空状态

### A6 — 独立事件（Event）页面

- [x] 后端：Event 列表接口，支持筛选与分页
- [x] 前端：事件列表页、筛选器、API、类型、路由
- [x] 验证：远端集群事件查询已通过

### A7 — Job 管理

- [x] 后端：Job 列表、详情、删除接入 workloads service
- [x] 前端：Workloads 页面支持 Job 展示
- [x] 验证：远端集群 Job 查询已通过

---

## 阶段 B：P1 运维效率提升

### B1 — YAML 查看器

- [x] 后端：`/api/yaml` 资源 YAML 查询接口
- [x] 前端：资源详情中接入 YAML 面板与语法展示
- [x] 验证：主资源页面已能查看实时 YAML

### B2 — Pod Exec 终端

- [x] 后端：保留单次命令执行接口 `POST /api/pods/{ns}/{name}/exec`
- [x] 后端：新增 WebSocket 端点 `GET /api/pods/{ns}/{name}/exec`
- [x] 后端：接入 `pods:write` 权限控制
- [x] 后端：接入 Pod Exec 审计记录
- [x] 前端：Pods 页面已暴露 Exec 入口
- [x] 前端：将当前命令弹窗升级为 `xterm.js + WebSocket` 交互终端
- [x] 前端：支持容器切换、重连、清屏、连接状态提示
- [x] 本地验证：前端测试通过，构建通过，后端测试通过
- [x] 远端联调验证：真实 Pod 会话、实时输出、终端 resize 验收
- [x] 远端联调验证：`pod.exec` 审计记录已写入

### B3 — 资源创建向导

- [x] 后端：`POST /api/apply` 支持通过 YAML 创建资源
- [x] 前端：YAML 编辑、预览确认、Apply 流程
- [x] 验证：远端已成功创建并删除临时 ConfigMap

---

## 阶段 C：P2 平台安全

### C1 — 用户认证体系

- [x] 后端：用户、登录、登出、JWT 会话能力
- [x] 前端：登录页、Token 管理、登录态恢复
- [x] 验证：登录、登出、无效 Token 拦截已通过

### C2 — RBAC 权限模型

- [x] 后端：角色定义与权限中间件
- [x] 前端：按角色控制关键操作按钮与页面行为
- [x] 验证：`viewer` 账号已确认无法执行受限写操作

---

## 阶段 D：P3 可观测性增强

### D1 — Prometheus 集成

- [x] 后端：已预留 Prometheus 配置项与查询代理接口
- [x] 前端：AI 诊断页已预留指标展示入口
- [ ] 接入真实 `OBSERVABILITY_PROMETHEUS_URL` 与鉴权配置
- [ ] 联调真实 Prometheus 指标查询
- [ ] 验证：远端环境展示真实指标历史而非回退数据

### D2 — 聚合日志

- [x] 后端：已预留 Loki 配置项与聚合日志查询路径
- [x] 前端：AI 诊断页已预留日志聚合展示入口
- [ ] 接入真实 Loki / Elasticsearch
- [ ] 验证：远端环境展示真实聚合日志
- [ ] 当前状态：暂缓，待日志系统准备完成后重启

---

## 阶段 E：P4 管理员终端与命令台

### E1 — 集群命令台（kubectl console）

- [x] 后端：新增管理员专用 WebSocket 命令台端点，绑定 `clusterId` 与 `namespace`
- [x] 后端：封装 `kubectl` / PTY 执行链路，支持输入、输出、窗口 resize 与会话关闭
- [x] 后端：新增 `cluster.console` 审计记录，记录集群、命名空间、命令与执行结果
- [x] 前端：新增“集群命令台”页面，复用 `xterm.js + WebSocket` 终端能力
- [x] 前端：支持集群切换、命名空间上下文、常用命令提示与重连
- [x] 权限/安全：仅管理员开放，默认关闭，可配置启用
- [x] 验证：远端真实集群完成常见资源 CRUD / rollout / logs 命令验收

### E2 — 节点终端（Host Shell via DaemonSet）

- [x] 后端：定义节点终端会话接口与节点到 `host-shell` Pod 的映射逻辑
- [x] 后端：支持通过 `privileged DaemonSet + nsenter/chroot` 进入节点宿主机
- [x] 后端：新增 `node.shell` 审计记录、会话超时与高危操作标识
- [x] 前端：在节点页面增加“主机终端”入口、风险提示与会话状态展示
- [x] 部署：提供 `host-shell` DaemonSet / RBAC / 默认关闭开关配置
- [x] 本地验证：前端测试通过，构建通过，后端测试通过
- [x] 验证：远端节点 Shell 会话可用，并完成基础主机操作验收

---

## 当前建议优先级

- [x] 第一优先：完成 `E1 集群命令台（kubectl console）`
- [x] 第二优先：完成 `E2 节点终端（Host Shell via DaemonSet）`
- [ ] 第三优先：完成 `D1 Prometheus` 真实接入与验收
- [ ] 第四优先：日志系统具备条件后再恢复 `D2 聚合日志`

## 维护要求

- [x] 已将任务单整理为可持续勾选的状态
- [ ] 后续每完成一项功能后，同步更新本文件对应条目
