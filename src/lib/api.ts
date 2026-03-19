export const authAPI = {
  login: "/auth/login",
  logout: "/auth/logout",
  getUserInfo: "/auth/user-info",
};

export const dashboardAPI = {
  getClusterOverview: "/dashboard/overview",
  getResourceUsage: "/dashboard/resource-usage",
  getRecentEvents: "/dashboard/recent-events",
  getNamespaceDistribution: "/dashboard/namespace-distribution",
};

export const nodesAPI = {
  listNodes: "/nodes",
  getNodeDetail: "/nodes/:name",
  getNodeMetrics: "/nodes/:name/metrics",
  shell: "/nodes/:name/shell",
  cordonNode: "/nodes/:name/cordon",
  uncordonNode: "/nodes/:name/uncordon",
  enableMaintenance: "/nodes/:name/maintenance/enable",
  disableMaintenance: "/nodes/:name/maintenance/disable",
};

export const podsAPI = {
  listPods: "/pods",
  getPodDetail: "/pods/:namespace/:name",
  getPodLogs: "/pods/:namespace/:name/logs",
  getPodMetrics: "/pods/:namespace/:name/metrics",
  deletePod: "/pods/:namespace/:name",
  restartPod: "/pods/:namespace/:name/restart",
};

export const workloadsAPI = {
  listDeployments: "/deployments",
  getDeploymentDetail: "/deployments/:namespace/:name",
  scaleDeployment: "/deployments/:namespace/:name/scale",
  restartDeployment: "/deployments/:namespace/:name/restart",
  pauseDeployment: "/deployments/:namespace/:name/pause",
  resumeDeployment: "/deployments/:namespace/:name/resume",
  deleteDeployment: "/deployments/:namespace/:name",
  listStatefulSets: "/statefulsets",
  getStatefulSetDetail: "/statefulsets/:namespace/:name",
  scaleStatefulSet: "/statefulsets/:namespace/:name/scale",
  restartStatefulSet: "/statefulsets/:namespace/:name/restart",
  deleteStatefulSet: "/statefulsets/:namespace/:name",
  listDaemonSets: "/daemonsets",
  getDaemonSetDetail: "/daemonsets/:namespace/:name",
  restartDaemonSet: "/daemonsets/:namespace/:name/restart",
  deleteDaemonSet: "/daemonsets/:namespace/:name",
  listCronJobs: "/cronjobs",
  getCronJobDetail: "/cronjobs/:namespace/:name",
  deleteCronJob: "/cronjobs/:namespace/:name",
};

export const namespacesAPI = {
  listNamespaces: "/namespaces",
  getNamespaceDetail: "/namespaces/:name",
};

export const servicesAPI = {
  list: "/services",
  detail: "/services/:namespace/:name",
  delete: "/services/:namespace/:name",
};

export const ingressesAPI = {
  list: "/ingresses",
  detail: "/ingresses/:namespace/:name",
  delete: "/ingresses/:namespace/:name",
};

export const configMapsAPI = {
  list: "/configmaps",
  detail: "/configmaps/:namespace/:name",
  delete: "/configmaps/:namespace/:name",
};

export const secretsAPI = {
  list: "/secrets",
  detail: "/secrets/:namespace/:name",
};

export const storageAPI = {
  listPVCs: "/pvcs",
  pvcDetail: "/pvcs/:namespace/:name",
  listPVs: "/pvs",
  pvDetail: "/pvs/:name",
  listStorageClasses: "/storageclasses",
  storageClassDetail: "/storageclasses/:name",
};

export const eventsAPI = {
  list: "/events",
};

export const jobsAPI = {
  list: "/jobs",
  detail: "/jobs/:namespace/:name",
  delete: "/jobs/:namespace/:name",
};

export const execAPI = {
  exec: "/pods/:namespace/:name/exec",
};

export const clusterConsoleAPI = {
  meta: "/cluster-console/meta",
  ws: "/cluster-console/ws",
};

export const nodeShellAPI = {
  meta: "/node-shell/meta",
};

export const applyAPI = {
  apply: "/apply",
};

export const clustersAPI = {
  listClusters: "/clusters",
  getDefaultCluster: "/clusters/default",
  createCluster: "/clusters",
  updateCluster: "/clusters/:id",
  deleteCluster: "/clusters/:id",
  testCluster: "/clusters/:id/test",
};

export const aiDiagnosisAPI = {
  getTemplates: "/ai-diagnosis/templates",
  createTemplate: "/ai-diagnosis/templates",
  updateTemplate: "/ai-diagnosis/templates/:id",
  deleteTemplate: "/ai-diagnosis/templates/:id",
  getNodeStatus: "/ai-diagnosis/node-status",
  getLatestInspection: "/ai-diagnosis/inspections/latest",
  listInspections: "/ai-diagnosis/inspections",
  runInspection: "/ai-diagnosis/inspections/run",
  listIssues: "/ai-diagnosis/issues",
  getIssueDetail: "/ai-diagnosis/issues/:id",
  acknowledgeIssue: "/ai-diagnosis/issues/:id/acknowledge",
  silenceIssue: "/ai-diagnosis/issues/:id/silence",
  escalateIssue: "/ai-diagnosis/issues/:id/escalate",
  followIssue: "/ai-diagnosis/issues/:id/follow",
  resolveIssue: "/ai-diagnosis/issues/:id/resolve",
  runFollowUpRecheck: "/ai-diagnosis/follow-up-recheck",
  getRiskSummary: "/ai-diagnosis/risk-summary",
  getMultiClusterSummary: "/ai-diagnosis/multi-cluster-summary",
  getMetricsHistory: "/ai-diagnosis/metrics/history",
  getAggregatedLogs: "/ai-diagnosis/logs/aggregate",
  listMemories: "/ai-diagnosis/memory",
  listResourceMemories: "/ai-diagnosis/memory/resource",
  saveMemoryFeedback: "/ai-diagnosis/memory/feedback",
  getDiagnosisHistory: "/ai-diagnosis/history",
  getConversationDetail: "/ai-diagnosis/history/:id",
  deleteConversation: "/ai-diagnosis/history/:id",
  sendMessage: "/ai-diagnosis/chat",
  streamMessage: "/ai-diagnosis/chat/stream",
};

export const settingsAPI = {
  getSettings: "/settings",
  updateSettings: "/settings",
  getNotificationSettings: "/settings/notifications",
  updateNotificationSettings: "/settings/notifications",
  getAIModels: "/settings/ai-models",
  updateAIModels: "/settings/ai-models",
};

export const auditAPI = {
  listAuditLogs: "/audit-logs",
};

export const notificationsAPI = {
  listNotifications: "/notifications",
  markAllRead: "/notifications/read-all",
};

export const yamlAPI = {
  get: "/yaml",
};

export function replacePathParams(
  path: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce((currentPath, [key, value]) => {
    return currentPath.replace(`:${key}`, encodeURIComponent(String(value)));
  }, path);
}
