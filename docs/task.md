# K8s Agent 功能补充任务

## 阶段 A：P0 核心 K8s 资源管理

### A1 — Service 管理
- [ ] 后端：`service/services.go` — 通过 K8s client 实现 Service 列表/详情/删除
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册 `GET /api/services`、`GET /api/services/{ns}/{name}`、`DELETE /api/services/{ns}/{name}`
- [ ] 前端：[src/lib/api.ts](file:///home/soft/k8s/k8sAgent/src/lib/api.ts) — 增加 `servicesAPI`
- [ ] 前端：[src/lib/types.ts](file:///home/soft/k8s/k8sAgent/src/lib/types.ts) — 增加 Service 类型定义
- [ ] 前端：`src/pages/Services.tsx` — Service 列表页 + 详情面板
- [ ] 前端：[src/App.tsx](file:///home/soft/k8s/k8sAgent/src/App.tsx) — 注册 `/services` 路由
- [ ] 前端：[Dashboard.tsx](file:///home/soft/k8s/k8sAgent/src/pages/Dashboard.tsx) — 侧边栏增加 Service 导航项
- [ ] 测试验证

### A2 — Ingress 管理
- [ ] 后端：`service/ingresses.go` — Ingress 列表/详情/删除
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册 Ingress 路由
- [ ] 前端：[src/lib/api.ts](file:///home/soft/k8s/k8sAgent/src/lib/api.ts) — 增加 `ingressesAPI`
- [ ] 前端：[src/lib/types.ts](file:///home/soft/k8s/k8sAgent/src/lib/types.ts) — 增加 Ingress 类型定义
- [ ] 前端：`src/pages/Ingresses.tsx` — Ingress 列表页 + 详情面板
- [ ] 前端：路由和导航注册
- [ ] 测试验证

### A3 — ConfigMap 管理
- [ ] 后端：`service/configmaps.go` — ConfigMap 列表/详情/删除
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册 ConfigMap 路由
- [ ] 前端：API / 类型 / 页面 / 路由
- [ ] 测试验证

### A4 — Secret 管理（只读）
- [ ] 后端：`service/secrets.go` — Secret 列表/详情（值脱敏）
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册 Secret 路由
- [ ] 前端：API / 类型 / 页面 / 路由
- [ ] 测试验证

### A5 — 存储管理（PVC / PV / StorageClass）
- [ ] 后端：`service/storage.go` — PVC、PV、StorageClass 列表/详情
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册存储路由
- [ ] 前端：`src/pages/Storage.tsx` — 带 Tab 切换的存储页面
- [ ] 前端：API / 类型 / 路由
- [ ] 测试验证

### A6 — 独立事件（Event）页面
- [ ] 后端：`service/events.go` — Event 列表（支持筛选和分页）
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册 Event 路由
- [ ] 前端：`src/pages/Events.tsx` — 事件列表页 + 筛选器
- [ ] 前端：API / 类型 / 路由
- [ ] 测试验证

### A7 — Job 管理
- [ ] 后端：增加 Job 的列表/详情/删除到 workloads service
- [ ] 后端：[router.go](file:///home/soft/k8s/k8sAgent/backend/internal/api/router.go) — 注册 Job 路由
- [ ] 前端：Workloads 页面增加 Job Tab 或独立页面
- [ ] 前端：API / 类型
- [ ] 测试验证

---

## 阶段 B：P1 运维效率提升

### B1 — YAML 查看器
- [ ] 后端：各资源详情接口增加 `rawYaml` 字段或 `/yaml` 子路由
- [ ] 前端：详情面板增加 YAML Tab + 语法高亮
- [ ] 测试验证

### B2 — Pod Exec 终端
- [ ] 后端：WebSocket 端点 `WS /api/pods/{ns}/{name}/exec`
- [ ] 前端：集成 xterm.js 终端组件
- [ ] 审计记录
- [ ] 测试验证

### B3 — 资源创建向导
- [ ] 后端：`POST /api/apply` — 通过 YAML 创建资源
- [ ] 前端：YAML 编辑器 + 预览确认 + Apply
- [ ] 测试验证

---

## 阶段 C：P2 平台安全

### C1 — 用户认证体系
- [ ] 后端：用户表、JWT 签发、登录/登出接口
- [ ] 前端：登录页面、Token 管理、请求拦截器
- [ ] 测试验证

### C2 — RBAC 权限模型
- [ ] 后端：角色定义、权限中间件
- [ ] 前端：按角色控制 UI 可见性
- [ ] 测试验证

---

## 阶段 D：P3 可观测性增强

### D1 — Prometheus 集成
- [ ] 后端：Prometheus 查询代理接口
- [ ] 前端：指标面板、时间范围选择
- [ ] 测试验证

### D2 — 聚合日志
- [ ] 后端：Loki/ES 日志搜索接口
- [ ] 前端：日志搜索页面
- [ ] 测试验证
