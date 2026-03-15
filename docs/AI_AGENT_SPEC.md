# K8s Agent AI 能力增强方案

## 1. 背景

当前项目已经具备：

- 真实集群接入与多集群切换
- 节点、Pods、工作负载、仪表盘等基础只读/写操作
- AI 诊断页、历史会话、模型配置

但当前 AI 诊断仍然更像“带集群上下文的问答助手”，还没有真正深入到运维流程中。现阶段的主要缺口包括：

- 诊断结果仍以纯文本为主，缺少结构化的结论、风险、证据和动作建议
- AI 输出无法一键跳转到节点、Pod、工作负载详情
- 同一次诊断中还没有把事件、日志、指标串成证据链
- 没有流式输出，长回复等待时间较长
- 没有场景化诊断模板，用户每次都要自己组织问题

本方案的目标，是把当前 AI 页从“聊天问答”升级成“可落地的运维诊断助手”。

## 2. 目标

本期实现以下能力：

1. AI 回复结构化
   - 每次诊断除了自然语言回复，还要返回结构化诊断结果
   - 结果包含：结论、风险等级、关键发现、建议动作、证据链

2. 资源深链路跳转
   - AI 结果中的节点、Pod、工作负载应支持一键跳转到资源详情
   - 跳转后自动打开对应详情面板，而不是只进入列表页

3. 证据链
   - 同一次诊断中，把以下证据统一挂到结果中：
     - 事件
     - Pod 日志
     - Pod/Node 指标
     - 工作负载状态

4. 流式输出
   - AI 对话支持流式返回
   - 前端在回复过程中可增量展示内容，而不是等待整段完成

5. 场景化诊断模板
   - 预置高频场景模板，快速发起诊断
   - 首批模板：
     - Pod Pending
     - PVC Pending
     - CrashLoopBackOff
     - Node Pressure

## 3. 非目标

本期不做以下能力：

- AI 直接替用户执行集群危险操作
- 自动修改 YAML 或自动发布变更
- 完整的知识库/RAG 系统
- 多轮 Agent 工具调用编排框架

AI 本期定位仍是“诊断与建议”，而不是“自动代操作”。

## 4. 用户体验目标

### 4.1 诊断流程

用户进入 AI 诊断页后，可以通过三种方式发起诊断：

1. 自由输入问题
2. 点击模板，自动预填问题
3. 在已有历史会话基础上继续追问

发起诊断后，页面行为如下：

1. 用户消息立即插入会话区
2. AI 回复使用流式展示
3. 回复完成后，在消息下方同步展示结构化诊断卡片
4. 卡片中的资源按钮可以跳转到节点、Pod、工作负载详情
5. 历史记录保留结构化结果，重新打开历史会话时可完整回看

### 4.2 结构化结果展示

每条 AI 诊断结果需要包含以下区域：

- 结论摘要
- 风险等级
- 关键发现
- 建议动作
- 证据链

其中：

- 建议动作应优先面向具体对象
- 证据链应显示证据类型、摘要、关联资源、时间
- 支持从卡片直接跳转到资源详情页

## 5. 数据结构设计

### 5.1 消息元数据

需要为 AI 会话消息增加 `metadata` 字段，用于存储结构化诊断结果。

消息结构：

```json
{
  "id": "msg-xxx",
  "role": "assistant",
  "content": "自然语言回复",
  "createdAt": "2026-03-15T12:00:00Z",
  "metadata": {
    "templateId": "pod-pending",
    "report": {}
  }
}
```

### 5.2 诊断报告结构

```json
{
  "title": "Pod Pending 诊断",
  "summary": "当前集群存在 3 个 Pending Pod，主要集中在 kube-system。",
  "conclusion": "问题主要来自调度约束与存储准备不足。",
  "riskLevel": "high",
  "findings": [
    {
      "title": "kube-system 中存在持续 Pending Pod",
      "detail": "2 个 Pod 已等待超过 10 分钟",
      "severity": "high",
      "evidenceIds": ["e-1", "e-2"]
    }
  ],
  "actions": [
    {
      "title": "查看 Pod 详情与事件",
      "description": "优先确认调度失败原因或卷挂载失败原因",
      "priority": "p1",
      "target": {
        "kind": "pod",
        "namespace": "kube-system",
        "name": "example-pod",
        "route": "/pods?namespace=kube-system&name=example-pod"
      }
    }
  ],
  "evidence": [
    {
      "id": "e-1",
      "type": "event",
      "severity": "high",
      "title": "FailedScheduling",
      "summary": "0/3 nodes are available",
      "timestamp": "2026-03-15T12:00:00Z",
      "target": {
        "kind": "pod",
        "namespace": "kube-system",
        "name": "example-pod",
        "route": "/pods?namespace=kube-system&name=example-pod"
      },
      "snippets": [
        "0/3 nodes are available: 1 node(s) had volume node affinity conflict"
      ]
    }
  ]
}
```

### 5.3 目标资源结构

```json
{
  "kind": "pod|node|workload",
  "scope": "deployments|statefulsets|daemonsets|cronjobs",
  "namespace": "default",
  "name": "demo-app",
  "route": "/pods?namespace=default&name=demo-app",
  "label": "default/demo-app"
}
```

## 6. 场景模板设计

首批模板定义如下：

### 6.1 Pod Pending

- 模板 ID：`pod-pending`
- 用途：分析 Pod 长时间 Pending 的原因
- 重点证据：
  - 调度事件
  - Pod 状态
  - 关联节点资源情况
  - 关联 PVC/存储异常关键词

### 6.2 PVC Pending

- 模板 ID：`pvc-pending`
- 用途：分析卷申请、存储类、绑定失败
- 重点证据：
  - 事件中的 PVC / Provisioning / Volume 关键词
  - Pending Pod
  - 关联工作负载

### 6.3 CrashLoopBackOff

- 模板 ID：`crashloopbackoff`
- 用途：分析容器重复重启
- 重点证据：
  - Pod 状态
  - Pod 日志
  - 最近事件
  - 工作负载状态

### 6.4 Node Pressure

- 模板 ID：`node-pressure`
- 用途：分析节点资源压力或不可调度问题
- 重点证据：
  - 节点 CPU/内存使用率
  - 节点可调度状态
  - 最近事件
  - 受影响 Pod/工作负载

## 7. 诊断证据链设计

### 7.1 证据来源

本期证据来源分为四类：

1. 事件
   - 来自 dashboard recent events
2. 指标
   - 来自 node metrics / pod metrics
3. 日志
   - 来自 pod logs
4. 状态
   - 来自 cluster overview、problem pods、workload alerts

### 7.2 证据拼装策略

每次诊断先构建一个候选证据池，再筛出最 relevant 的证据：

1. 收集最近异常事件
2. 收集异常 Pod
3. 收集高负载或异常节点
4. 收集 ready/available 异常工作负载
5. 对重点 Pod 补拉日志与指标
6. 按模板或问题关键词提升相关证据优先级

### 7.3 证据显示规则

- 最多展示 6 条关键证据
- 每条证据必须有类型、摘要、关联对象
- 若有关联资源，必须附带跳转链接

## 8. 后端实现方案

### 8.1 新增接口

#### 1. 获取诊断模板

- `GET /api/ai-diagnosis/templates`

返回模板列表，用于前端展示和预填提示词。

#### 2. 流式对话

- `POST /api/ai-diagnosis/chat/stream`

返回 `text/event-stream`，事件类型：

- `delta`：增量文本
- `done`：最终完整结果
- `error`：错误信息

`done` 中返回完整的会话对象和结构化报告。

### 8.2 现有接口增强

#### 1. 普通聊天接口

- `POST /api/ai-diagnosis/chat`

增强后返回：

- conversation
- cluster
- 结构化 report（通过消息 metadata 保留）

#### 2. 历史接口

- `GET /api/ai-diagnosis/history/{id}`

历史消息需要带回 `metadata`，保证历史回看时结构化结果完整可见。

### 8.3 数据持久化

为 `ai_conversation_messages` 增加：

- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`

用于保存：

- `templateId`
- `report`

## 9. 前端实现方案

### 9.1 AI 诊断页增强

在现有 AI 诊断页新增：

1. 模板区
   - 支持模板卡片和快捷入口

2. 流式输出
   - 发送消息后出现 AI 占位消息
   - 增量拼接内容
   - 完成后替换为最终持久化消息

3. 结构化结果卡片
   - 结论卡
   - 风险等级
   - 关键发现
   - 建议动作
   - 证据链

4. 一键跳转
   - 节点 -> `/nodes?name=...`
   - Pod -> `/pods?namespace=...&name=...`
   - 工作负载 -> `/workloads?type=...&namespace=...&name=...`

### 9.2 资源页联动

资源页需要支持 URL 查询参数自动打开详情：

- Nodes
- Pods
- Workloads

行为要求：

1. 页面加载数据后读取查询参数
2. 自动搜索并选中目标对象
3. 自动展开详情面板
4. 若对象不存在，给出提示

## 10. 验收标准

本期完成后，需要满足以下验收点：

1. AI 页支持流式输出
2. AI 回复完成后能展示结构化诊断卡片
3. 卡片中至少支持跳转到节点、Pod、工作负载详情
4. 同一次诊断结果中可看到事件、日志、指标构成的证据链
5. 历史记录重新打开后，结构化结果仍然完整显示
6. 模板入口可用，至少支持 4 个模板
7. 普通聊天接口和流式接口都能工作
8. 本地构建、后端测试通过

## 11. 实施顺序

### 第一阶段

- 补消息 metadata 持久化
- 输出中文 spec

### 第二阶段

- 后端模板接口
- 后端证据链组装
- 后端结构化报告生成

### 第三阶段

- 后端流式接口
- 前端流式消费

### 第四阶段

- 前端结构化结果卡片
- 资源页深链路跳转

### 第五阶段

- 联调验证
- 修正交互细节
- 留 Git 回退点

