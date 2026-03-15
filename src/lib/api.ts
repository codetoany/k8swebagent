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
  getNodeStatus: "/ai-diagnosis/node-status",
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

export function replacePathParams(
  path: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce((currentPath, [key, value]) => {
    return currentPath.replace(`:${key}`, encodeURIComponent(String(value)));
  }, path);
}
