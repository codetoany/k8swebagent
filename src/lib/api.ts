export const authAPI = {
  login: '/auth/login',
  logout: '/auth/logout',
  getUserInfo: '/auth/user-info',
};

export const dashboardAPI = {
  getClusterOverview: '/dashboard/overview',
  getResourceUsage: '/dashboard/resource-usage',
  getRecentEvents: '/dashboard/recent-events',
  getNamespaceDistribution: '/dashboard/namespace-distribution',
};

export const nodesAPI = {
  listNodes: '/nodes',
  getNodeDetail: '/nodes/:name',
  getNodeMetrics: '/nodes/:name/metrics',
};

export const podsAPI = {
  listPods: '/pods',
  getPodDetail: '/pods/:namespace/:name',
  getPodLogs: '/pods/:namespace/:name/logs',
  getPodMetrics: '/pods/:namespace/:name/metrics',
};

export const workloadsAPI = {
  listDeployments: '/deployments',
  getDeploymentDetail: '/deployments/:namespace/:name',
  listStatefulSets: '/statefulsets',
  getStatefulSetDetail: '/statefulsets/:namespace/:name',
  listDaemonSets: '/daemonsets',
  getDaemonSetDetail: '/daemonsets/:namespace/:name',
  listCronJobs: '/cronjobs',
  getCronJobDetail: '/cronjobs/:namespace/:name',
};

export const namespacesAPI = {
  listNamespaces: '/namespaces',
  getNamespaceDetail: '/namespaces/:name',
};

export const clustersAPI = {
  listClusters: '/clusters',
  getDefaultCluster: '/clusters/default',
  createCluster: '/clusters',
  updateCluster: '/clusters/:id',
  testCluster: '/clusters/:id/test',
};

export const aiDiagnosisAPI = {
  getNodeStatus: '/ai-diagnosis/node-status',
  getDiagnosisHistory: '/ai-diagnosis/history',
};

export const settingsAPI = {
  getSettings: '/settings',
  getAIModels: '/settings/ai-models',
};

export function replacePathParams(
  path: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce((currentPath, [key, value]) => {
    return currentPath.replace(`:${key}`, encodeURIComponent(String(value)));
  }, path);
}
