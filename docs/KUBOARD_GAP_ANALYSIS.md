# K8s Agent 与 Kuboard 功能差距分析

## 1. 当前项目现状

当前项目已经具备一个可用的 Kubernetes 管理平台基础能力，主要包括：

- 前端页面：
  - 仪表盘
  - 节点
  - Pods
  - 工作负载
  - 设置
  - AI 诊断
- 后端技术栈：
  - Go
  - PostgreSQL
  - Redis
  - Docker
- 真实集群接入能力：
  - 多集群配置
  - Token / kubeconfig / in-cluster 三种接入方式
- 已完成的只读能力：
  - 节点
  - Pods
  - 工作负载
  - 命名空间
  - 仪表盘聚合数据
  - 最近事件
- 已完成的写操作能力：
  - 节点 `cordon / uncordon`
  - 节点维护污点开关
  - Pod 重启 / 删除 / 日志查看
  - Deployment / StatefulSet 扩缩容
  - Deployment / StatefulSet / DaemonSet 重启
  - Deployment 暂停 / 恢复
  - 工作负载删除
- 已完成的配套能力：
  - 审计日志
  - 通知中心
  - AI 诊断
  - 集群配置管理界面

当前实现的关键代码位置：

- 前端路由：`src/App.tsx`
- 前端接口定义：`src/lib/api.ts`
- 后端路由：`backend/internal/api/router.go`
- Kubernetes 资源服务：
  - `backend/internal/service/nodes.go`
  - `backend/internal/service/pods.go`
  - `backend/internal/service/workloads.go`
  - `backend/internal/service/dashboard.go`
- 设置与审计：
  - `backend/internal/store/settings.go`
  - `backend/internal/store/audits.go`
  - `src/pages/Settings.tsx`

## 2. 对标 Kuboard 已经具备的能力

和 Kuboard 常见的基础能力相比，当前项目已经覆盖了以下部分：

### 2.1 集群接入与切换

- 多集群管理
- 默认集群
- Token / kubeconfig / in-cluster 接入
- 集群连接测试
- 资源视角的集群切换

### 2.2 核心资源浏览

- 仪表盘概览
- 节点
- Pods
- 工作负载：
  - Deployment
  - StatefulSet
  - DaemonSet
  - CronJob
- 命名空间

### 2.3 基础运维操作

- Pod 删除 / 重启 / 日志查看
- 工作负载扩缩容 / 重启 / 暂停 / 恢复 / 删除
- 节点禁止调度 / 恢复调度 / 维护污点开关

### 2.4 平台配套能力

- 审计日志筛选与分页
- 通知中心
- AI 诊断
- 设置持久化
- AI 模型配置

## 3. 与 Kuboard 的主要差距

如果目标是让当前项目逐步接近 Kuboard 这类成熟的集群运维平台，当前最重要的差距主要在下面几块。

### P0：资源类型覆盖还不够

当前项目还缺少很多日常高频对象的管理能力，例如：

- Service
- Ingress
- ConfigMap
- Secret
- PersistentVolume
- PersistentVolumeClaim
- StorageClass
- Job
- ReplicaSet
- 事件页（Event）作为独立模块

影响：

- 很多常见运维动作仍然要切回 `kubectl`
- 故障排查链路不完整
- 存储和流量入口管理还没有可视化

建议下一步：

1. 先补 `Service / Ingress / ConfigMap / Secret`
2. 再补 `PVC / PV / StorageClass`
3. 最后补独立的 `Event` 页面和事件时间线

### P0：监控还是概览型，不是真正的可观测性

当前仪表盘已经可用，但更像“运行概览”，还不是完整监控体系：

- 没有 Prometheus 集成
- 没有真实的历史指标存储
- 没有按查询维度的图表能力
- 没有告警规则
- 没有告警确认、静默等流程

影响：

- 当前仪表盘还不能替代成熟监控系统
- “今日 / 本周 / 本月” 还不够支撑生产排障
- AI 诊断拿到的历史上下文仍然不足

建议下一步：

1. 接入 Prometheus 或 VictoriaMetrics
2. 增加 namespace / workload / pod 级指标下钻
3. 增加告警规则与通知通道

### P0：日志仍然是单 Pod 视角，不是聚合日志

当前项目支持查看 Pod 日志，但还不是完整日志平台：

- 没有日志聚合后端
- 没有跨 Pod / 跨命名空间搜索
- 没有基于标签的日志筛选
- 没有日志保留策略

影响：

- 生产排障仍要依赖外部日志系统
- AI 诊断无法结合全局日志做证据关联

建议下一步：

1. 接入 Loki 或兼容 Elasticsearch 的日志系统
2. 增加日志检索页面
3. 支持 workload / namespace / pod 多维过滤

### P0：缺少平台内的用户、角色、权限体系

当前项目虽然有认证状态，但还不是一套真正的多用户平台：

- 没有用户管理
- 没有角色模型
- 没有命名空间级权限
- 没有集群级权限范围
- 审计中的操作者身份还比较简单

影响：

- 不能安全地让多人共同使用
- 不适合直接作为团队平台交付
- 高风险操作缺少权限边界

建议下一步：

1. 增加平台用户
2. 增加角色与权限矩阵
3. 增加集群 / 命名空间粒度授权
4. 审计日志绑定真实用户身份

### P1：缺少 YAML 视角的运维能力

Kuboard 用户通常会希望直接围绕 YAML 做对象查看和调整：

- 查看 YAML
- 比较 YAML
- 编辑 YAML
- 在 UI 中 apply / patch

当前项目还没有这条工作流。

影响：

- 复杂排障仍然要离开平台
- 对象修改能力还不完整

建议下一步：

1. 先做只读 YAML 查看器
2. 再做带确认和审计的安全编辑 / patch

### P1：缺少终端 / Exec 能力

当前平台还没有浏览器内终端能力：

- 没有 Pod Exec
- 没有容器终端
- 没有文件浏览能力

影响：

- 很多调试动作仍然必须回到终端

建议下一步：

1. 增加 Pod Exec 终端
2. 按 RBAC 与命名空间权限限制
3. 增加终端会话审计

### P1：缺少平台集成 / 套件管理

Kuboard 很多时候不只是“看资源”，还承担运维入口的角色：

- 安装或管理监控套件
- 安装或管理日志套件
- 管理 ingress / storage 依赖

当前项目还没有这一层。

影响：

- 运维链路仍然分散

建议下一步：

1. 增加“平台集成”或“组件管理”模块
2. 用于管理监控、日志、入口、存储等依赖

### P1：AI 诊断还没有深度融入运维流程

当前 AI 诊断已经是项目亮点，但和成熟运维平台结合还不够深：

- 还没有针对具体对象的操作建议
- 还没有从 AI 结果一键跳转到资源详情
- 还没有把事件、日志、指标作为同一次诊断结果的证据链
- 还没有流式输出
- 还没有场景化诊断模板

影响：

- AI 更像独立助手，而不是运维副驾

建议下一步：

1. AI 结果卡片增加跳转到节点 / Pod / 工作负载详情
2. 把 AI 与指标、事件、日志做关联
3. 增加流式输出
4. 增加诊断模板：
   - Pod Pending
   - PVC Pending
   - CrashLoopBackOff
   - Node Pressure

## 4. 推荐实施路线

如果目标是“参考 Kuboard，但不把项目做得过重”，我建议按下面顺序推进。

### 阶段 A：先补齐运维台常用资源

优先级：最高

- Service 管理
- Ingress 管理
- ConfigMap 管理
- Secret 只读管理
- Event 页面
- PVC / PV / StorageClass

结果：

- 平台可以覆盖大多数日常 Kubernetes 运维动作

### 阶段 B：补齐可观测性基础

优先级：最高

- Prometheus 集成
- 历史指标
- workload / pod 指标下钻
- 告警规则
- 通知通道
- 聚合日志集成

结果：

- 平台开始具备真正的监控与排障价值

### 阶段 C：补齐平台安全与多人协作

优先级：高

- 用户
- 角色
- 权限范围
- 更安全的危险操作确认
- 更丰富的审计维度

结果：

- 平台可以给团队使用，而不是只适合单人运维

### 阶段 D：补高级运维工作流

优先级：中

- YAML 查看 / 编辑
- Pod Exec 终端
- 资源跳转联动
- 平台集成 / 套件管理

结果：

- 用户离开平台的次数明显减少

### 阶段 E：增强 AI 运维副驾能力

优先级：中

- 流式输出
- 证据化诊断
- 操作建议
- 诊断模板
- 资源入口上的 AI 快捷诊断

结果：

- AI 从“问答助手”升级为“运维副驾”

## 5. 最推荐的下一批建设内容

如果要按“参考 Kuboard，优先补最有价值的能力”继续往下做，最合适的下一批是：

1. `Events + Services + Ingress`
2. `PVC / PV / StorageClass`
3. `Prometheus 历史监控`
4. `聚合日志`
5. `平台用户 / 角色 / 权限`

## 6. 不建议现在就急着做的能力

这些以后可以做，但不建议作为最优先批次：

- 完整的浏览器文件管理器
- 没有权限模型支撑的浏览器终端
- 完整组件市场
- 大而全的插件体系

原因：

- 安全成本和维护成本都更高
- 短期价值不如“资源覆盖 + 监控 + 日志 + 权限”

## 7. 建议目标形态

中期更合理的目标不是“复刻一个 Kuboard”，而是：

- 具备 Kuboard 级别的核心运维能力覆盖
- 同时保留更强的 AI 诊断与处置联动
- 产品边界更轻、更聚焦

换句话说，这个项目未来更适合的定位是：

- 一个 Kuboard 风格的 Kubernetes 管理平台
- 加上 AI 原生故障诊断能力
- 再加上更轻量、可定制的部署和控制方式
