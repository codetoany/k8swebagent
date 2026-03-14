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
};

export const podsAPI = {
  listPods: "/pods",
  getPodDetail: "/pods/:namespace/:name",
  getPodLogs: "/pods/:namespace/:name/logs",
  getPodMetrics: "/pods/:namespace/:name/metrics",
  deletePod: "/pods/:namespace/:name",
};

export const workloadsAPI = {
  listDeployments: "/deployments",
  getDeploymentDetail: "/deployments/:namespace/:name",
  scaleDeployment: "/deployments/:namespace/:name/scale",
  restartDeployment: "/deployments/:namespace/:name/restart",
  listStatefulSets: "/statefulsets",
  getStatefulSetDetail: "/statefulsets/:namespace/:name",
  scaleStatefulSet: "/statefulsets/:namespace/:name/scale",
  restartStatefulSet: "/statefulsets/:namespace/:name/restart",
  listDaemonSets: "/daemonsets",
  getDaemonSetDetail: "/daemonsets/:namespace/:name",
  restartDaemonSet: "/daemonsets/:namespace/:name/restart",
  listCronJobs: "/cronjobs",
  getCronJobDetail: "/cronjobs/:namespace/:name",
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
  getNodeStatus: "/ai-diagnosis/node-status",
  getDiagnosisHistory: "/ai-diagnosis/history",
};

export const settingsAPI = {
  getSettings: "/settings",
  getAIModels: "/settings/ai-models",
};

export const auditAPI = {
  listAuditLogs: "/audit-logs",
};

export function replacePathParams(
  path: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce((currentPath, [key, value]) => {
    return currentPath.replace(`:${key}`, encodeURIComponent(String(value)));
  }, path);
}
