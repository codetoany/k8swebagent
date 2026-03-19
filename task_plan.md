# Task Plan: E 阶段规划与任务落盘

## 目标

将管理员级“集群命令台”和“节点终端”纳入项目任务单，明确实现边界、优先级与后续开发顺序。

## 当前阶段

Phase 3

## 阶段拆分

### Phase 1：需求定稿与任务单回写

- [x] 明确当前 K8s 凭据不等同于主机 SSH 权限
- [x] 明确无跳板机场景下的两条实现路线
- [x] 确认拆分为 `E1 集群命令台` 与 `E2 节点终端`
- [x] 回写 `docs/task.md` 与建议优先级

### Phase 2：E1 集群命令台（kubectl console）

- [x] 设计后端 WebSocket / PTY / `kubectl` 执行链路
- [x] 设计前端命令台页面、入口与上下文切换
- [x] 增加管理员权限、默认关闭开关与审计记录
- [x] 完成本地验证与远端真实集群验收

### Phase 3：E2 节点终端（Host Shell）

- [x] 明确复用 `Pod Exec` WebSocket 协议实现节点终端
- [x] 明确采用 `host-shell` DaemonSet + `nsenter/chroot` 进入宿主机
- [x] 设计 `host-shell` DaemonSet / RBAC / 安全开关
- [x] 打通节点到 `host-shell` Pod 的会话映射与宿主机进入逻辑
- [x] 增加高危提示、审计、会话超时控制
- [x] 完成本地验证与远端节点验收

## 当前结论

- E 阶段需求已确认并纳入 `docs/task.md`。
- `E1 集群命令台` 已完成并通过远端真实集群验收。
- `E2 节点终端` 已完成远端部署与真实节点验收。
- 下一步实现顺序为：`D1 Prometheus`。

## 关键约束

- 不将 K8s 凭据误当作主机 SSH 凭据
- 管理员专用终端仍保留显式开关、完整审计与会话超时
- 优先复用现有 `xterm.js + WebSocket + 审计` 能力，减少重复实现
