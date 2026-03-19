export interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceName: string;
  namespace?: string;
  clusterId?: string;
  clusterName?: string;
  status: 'success' | 'failed';
  message: string;
  actorName: string;
  actorEmail: string;
  createdAt: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export type AuditTheme = 'light' | 'dark';

export function getAuditActionLabel(action: string) {
  switch (action) {
    case 'cluster.create':
      return '新增集群';
    case 'cluster.update':
      return '更新集群';
    case 'cluster.delete':
      return '删除集群';
    case 'cluster.test':
      return '测试连接';
    case 'cluster.console':
      return '集群命令台';
    case 'node.shell':
      return '节点终端';
    case 'settings.update':
      return '更新通用设置';
    case 'settings.notifications.update':
      return '更新通知设置';
    case 'settings.ai-models.update':
      return '更新 AI 模型';
    case 'workload.scale':
      return '扩缩容';
    case 'workload.restart':
      return '重启工作负载';
    case 'workload.delete':
      return '删除工作负载';
    case 'workload.pause':
      return '暂停工作负载';
    case 'workload.resume':
      return '恢复工作负载';
    case 'pod.restart':
      return '重启 Pod';
    case 'pod.delete':
      return '删除 Pod';
    case 'node.cordon':
      return '节点禁止调度';
    case 'node.uncordon':
      return '节点恢复调度';
    case 'node.maintenance.enable':
      return '开启维护污点';
    case 'node.maintenance.disable':
      return '清除维护污点';
    default:
      return action;
  }
}

export function getAuditStatusMeta(
  status: AuditLogEntry['status'],
  theme: AuditTheme,
) {
  if (status === 'success') {
    return {
      label: '成功',
      badgeClass:
        theme === 'dark'
          ? 'border border-green-500/30 bg-green-500/10 text-green-300'
          : 'border border-green-200 bg-green-50 text-green-700',
    };
  }

  return {
    label: '失败',
    badgeClass:
      theme === 'dark'
        ? 'border border-red-500/30 bg-red-500/10 text-red-300'
        : 'border border-red-200 bg-red-50 text-red-700',
  };
}

export const auditActionOptions = [
  { value: '', label: '全部动作' },
  { value: 'cluster.create', label: '新增集群' },
  { value: 'cluster.update', label: '更新集群' },
  { value: 'cluster.delete', label: '删除集群' },
  { value: 'cluster.test', label: '测试连接' },
  { value: 'cluster.console', label: '集群命令台' },
  { value: 'node.shell', label: '节点终端' },
  { value: 'settings.update', label: '更新通用设置' },
  { value: 'settings.notifications.update', label: '更新通知设置' },
  { value: 'settings.ai-models.update', label: '更新 AI 模型' },
  { value: 'workload.scale', label: '扩缩容' },
  { value: 'workload.restart', label: '重启工作负载' },
  { value: 'workload.delete', label: '删除工作负载' },
  { value: 'workload.pause', label: '暂停工作负载' },
  { value: 'workload.resume', label: '恢复工作负载' },
  { value: 'pod.delete', label: '删除 Pod' },
  { value: 'pod.restart', label: '重启 Pod' },
  { value: 'node.cordon', label: '节点禁止调度' },
  { value: 'node.uncordon', label: '节点恢复调度' },
  { value: 'node.maintenance.enable', label: '开启维护污点' },
  { value: 'node.maintenance.disable', label: '清除维护污点' },
] as const;

export const auditResourceTypeOptions = [
  { value: '', label: '全部资源' },
  { value: 'cluster', label: '集群' },
  { value: 'settings', label: '设置' },
  { value: 'pod', label: 'Pod' },
  { value: 'node', label: '节点' },
  { value: 'deployments', label: 'Deployment' },
  { value: 'statefulsets', label: 'StatefulSet' },
  { value: 'daemonsets', label: 'DaemonSet' },
  { value: 'cronjobs', label: 'CronJob' },
] as const;
