# Progress

## 2026-03-19

### B 阶段剩余任务

- 已完成：任务单重构为可勾选状态
- 已完成：后端 Pod Exec WebSocket 路由、权限与审计收口
- 已完成：前端 Pod Exec 终端化改造，改为 `xterm.js + WebSocket`
- 已完成：补充 WebSocket URL token 鉴权兼容
- 已完成：更新 `PodExecModal` 测试与 canvas 测试桩
- 已完成：`npm test`
- 已完成：`npm run build:verify`
- 已完成：`go test ./...`
- 已完成：远端重建前后端容器并恢复服务
- 已完成：修复前端 Nginx WebSocket 升级转发
- 已完成：远端验证真实 Pod WebSocket 终端、回显、resize 与审计记录

### E 阶段规划

- 已确认新增管理员级“集群命令台（kubectl console）”与“节点终端（host shell）”需求
- 已明确：K8s 凭据不等同于主机 SSH 权限，无跳板机时需要单独设计节点终端方案
- 已回写 `docs/task.md`，新增 `E1` / `E2` 任务项并调整建议优先级
- 已重写 `task_plan.md`，将当前计划切换到 E 阶段规划
- 已补充 `findings.md`，记录命令台与节点终端的边界、风险与实现建议

### E1 集群命令台

- 已完成：后端 `cluster-console` WebSocket / PTY / `kubectl` 会话链路
- 已完成：后端 `cluster.console` 权限、开关配置与审计记录
- 已完成：前端“集群命令台”页面、导航入口、命名空间上下文与重连能力
- 已完成：补充 `ClusterConsole` 前端测试与后端命令台测试
- 已完成：补充 Docker / Compose 环境变量与远端部署配置
- 已完成：修复受限容器中 `Setpgid` 导致的 `operation not permitted`
- 已完成：修复 PTY 正常关闭时 `/dev/ptmx` 被误判为错误的问题
- 已完成：本地验证 `npm test`、`npm run build:verify`、`go test ./...`
- 已完成：远端重建 API / Frontend 容器并启用 `CLUSTER_CONSOLE_ENABLED`
- 已完成：远端验证 `kubectl get ns`、`create/get/delete configmap`、`rollout status`、`logs`、`resize` 与审计记录

### E2 节点终端

- 已开始：梳理 `Nodes` 页面、`Pod Exec` WebSocket 链路与部署/RBAC 清单
- 已确认：E2 复用现有 `Pod Exec` 协议，只新增“节点名 -> host-shell Pod -> Pod Exec”映射层
- 已确认：前端优先在 `Nodes` 页面以终端弹窗方式落地，不新增独立页面
- 已确认：宿主机进入方式采用 `host-shell DaemonSet + nsenter/chroot`
- 已完成：后端 `node-shell/meta` 与 `GET /api/nodes/{name}/shell`，支持节点到 `host-shell` Pod 映射、管理员鉴权、审计和会话超时
- 已完成：补充 `HOST_SHELL_*` 配置、远端部署脚本与 `host-shell` DaemonSet 清单
- 已完成：前端新增 `NodeShellModal`，在 `Nodes` 页面增加入口、高危提示、运行时状态和 WebSocket 节点终端弹窗
- 已完成：补充 `src/lib/nodes.ts`、`NodeShellModal.test.tsx`、`nodes.test.ts`，并通过 `npm test`、`npm run build:verify`、`go test ./...`
- 已完成：远端启用 `HOST_SHELL_ENABLED=true`，通过 `/api/apply` 创建 `host-shell` DaemonSet，并确认 3/3 节点 Pod 运行
- 已完成：修正默认宿主机进入命令为 `nsenter -t 1 -m -u -i -n -p -- chroot /proc/1/root /bin/sh -l`，避免进入 host mount namespace 后丢失 `/host`
- 已完成：远端验收 `k8s-node01` 节点终端，成功返回 `hostname=k8s-node01`、`id -u=0`、`stty size=40 140`、`echo codex-e2-node-shell`
- 已完成：`node.shell` 审计日志写入成功，记录了修正后的进入命令、目标节点和 host-shell Pod
