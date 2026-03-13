// K8s Agent 后端API接口定义

// 认证接口
export const authAPI = {
  login: '/api/auth/login',        // 用户登录
  logout: '/api/auth/logout',      // 用户登出
  getUserInfo: '/api/auth/user-info' // 获取用户信息
};

// 仪表盘接口
export const dashboardAPI = {
  getClusterOverview: '/api/dashboard/overview',     // 获取集群概览
  getResourceUsage: '/api/dashboard/resource-usage', // 获取资源使用趋势
  getRecentEvents: '/api/dashboard/recent-events',   // 获取最近事件
  getNamespaceDistribution: '/api/dashboard/namespace-distribution' // 获取命名空间分布
};

// 节点接口
export const nodesAPI = {
  listNodes: '/api/nodes',              // 获取节点列表
  getNodeDetail: '/api/nodes/:name',    // 获取节点详情
  createNode: '/api/nodes',             // 创建节点（通常由kubelet自动注册）
  updateNode: '/api/nodes/:name',       // 更新节点标签或污点
  deleteNode: '/api/nodes/:name',       // 删除节点
  getNodeMetrics: '/api/nodes/:name/metrics' // 获取节点指标
};

// Pod接口
export const podsAPI = {
  listPods: '/api/pods',                // 获取Pod列表
  getPodDetail: '/api/pods/:namespace/:name', // 获取Pod详情
  createPod: '/api/pods',               // 创建Pod
  deletePod: '/api/pods/:namespace/:name', // 删除Pod
  getPodLogs: '/api/pods/:namespace/:name/logs', // 获取Pod日志
  getPodMetrics: '/api/pods/:namespace/:name/metrics' // 获取Pod指标
};

// 工作负载接口
export const workloadsAPI = {
  listDeployments: '/api/deployments',              // 获取Deployment列表
  getDeploymentDetail: '/api/deployments/:namespace/:name', // 获取Deployment详情
  createDeployment: '/api/deployments',             // 创建Deployment
  updateDeployment: '/api/deployments/:namespace/:name', // 更新Deployment
  deleteDeployment: '/api/deployments/:namespace/:name', // 删除Deployment
  scaleDeployment: '/api/deployments/:namespace/:name/scale', // 扩缩容Deployment
  
  listStatefulSets: '/api/statefulsets',              // 获取StatefulSet列表
  getStatefulSetDetail: '/api/statefulsets/:namespace/:name', // 获取StatefulSet详情
  
  listDaemonSets: '/api/daemonsets',              // 获取DaemonSet列表
  getDaemonSetDetail: '/api/daemonsets/:namespace/:name', // 获取DaemonSet详情
  
  listCronJobs: '/api/cronjobs',              // 获取CronJob列表
  getCronJobDetail: '/api/cronjobs/:namespace/:name', // 获取CronJob详情
};

// 命名空间接口
export const namespacesAPI = {
  listNamespaces: '/api/namespaces',         // 获取命名空间列表
  getNamespaceDetail: '/api/namespaces/:name', // 获取命名空间详情
  createNamespace: '/api/namespaces',        // 创建命名空间
  deleteNamespace: '/api/namespaces/:name'   // 删除命名空间
};

// AI诊断接口
export const aiDiagnosisAPI = {
  analyzeCluster: '/api/ai-diagnosis/analyze-cluster',  // 分析集群状态
  analyzePodFailure: '/api/ai-diagnosis/analyze-pod',   // 分析Pod失败原因
  getWorkloadOptimization: '/api/ai-diagnosis/optimize-workloads', // 获取工作负载优化建议
  getNodeStatus: '/api/ai-diagnosis/node-status',       // 查看节点状态
  getDiagnosisHistory: '/api/ai-diagnosis/history',     // 获取诊断历史
  getChatResponse: '/api/ai-diagnosis/chat'             // 与AI助手对话
};

// 设置接口
export const settingsAPI = {
  getSettings: '/api/settings',     // 获取系统设置
  updateSettings: '/api/settings',  // 更新系统设置
  getAIModels: '/api/settings/ai-models', // 获取AI模型配置
  updateAIModel: '/api/settings/ai-models/:id' // 更新AI模型配置
};