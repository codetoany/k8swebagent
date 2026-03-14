import { useEffect, useMemo, useState } from 'react';
import { Eye, Package, RefreshCw, Search } from 'lucide-react';

import AppShell from '@/components/AppShell';
import apiClient from '@/lib/apiClient';
import { namespacesAPI, workloadsAPI } from '@/lib/api';
import { useThemeContext } from '@/contexts/themeContext';

interface WorkloadItem {
  id: string;
  name: string;
  namespace: string;
  ready?: number;
  desired?: number;
  available?: number;
  upToDate?: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  schedule?: string;
  lastSchedule?: string;
  serviceName?: string;
  strategy?: string;
  type: 'deployment' | 'statefulset' | 'daemonset' | 'cronjob';
}

interface NamespaceItem {
  name: string;
}

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function Workloads() {
  const { theme } = useThemeContext();
  const dark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [workloads, setWorkloads] = useState<WorkloadItem[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>(['全部']);
  const [selectedNamespace, setSelectedNamespace] = useState('全部');
  const [selectedType, setSelectedType] = useState<'all' | WorkloadItem['type']>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkload, setSelectedWorkload] = useState<WorkloadItem | null>(null);

  async function loadWorkloads() {
    setLoading(true);
    try {
      const [deployments, statefulsets, daemonsets, cronjobs, namespaceData] = await Promise.all([
        apiClient.get<Omit<WorkloadItem, 'type'>[]>(workloadsAPI.listDeployments),
        apiClient.get<Omit<WorkloadItem, 'type'>[]>(workloadsAPI.listStatefulSets),
        apiClient.get<Omit<WorkloadItem, 'type'>[]>(workloadsAPI.listDaemonSets),
        apiClient.get<Omit<WorkloadItem, 'type'>[]>(workloadsAPI.listCronJobs),
        apiClient.get<NamespaceItem[]>(namespacesAPI.listNamespaces),
      ]);

      setWorkloads([
        ...deployments.map((item) => ({ ...item, type: 'deployment' as const })),
        ...statefulsets.map((item) => ({ ...item, type: 'statefulset' as const })),
        ...daemonsets.map((item) => ({ ...item, type: 'daemonset' as const })),
        ...cronjobs.map((item) => ({ ...item, type: 'cronjob' as const })),
      ]);
      setNamespaces(['全部', ...namespaceData.map((item) => item.name)]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkloads();
  }, []);

  const filteredWorkloads = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return workloads.filter((workload) => {
      const matchesNamespace = selectedNamespace === '全部' || workload.namespace === selectedNamespace;
      const matchesType = selectedType === 'all' || workload.type === selectedType;
      const matchesKeyword = !keyword || [workload.name, workload.namespace, workload.type].some((field) => field.toLowerCase().includes(keyword));
      return matchesNamespace && matchesType && matchesKeyword;
    });
  }, [searchTerm, selectedNamespace, selectedType, workloads]);

  const typeCounts = {
    deployment: workloads.filter((item) => item.type === 'deployment').length,
    statefulset: workloads.filter((item) => item.type === 'statefulset').length,
    daemonset: workloads.filter((item) => item.type === 'daemonset').length,
    cronjob: workloads.filter((item) => item.type === 'cronjob').length,
  };

  const typeLabel: Record<WorkloadItem['type'], string> = {
    deployment: 'Deployment',
    statefulset: 'StatefulSet',
    daemonset: 'DaemonSet',
    cronjob: 'CronJob',
  };

  return (
    <AppShell
      title="工作负载管理"
      description="统一查看 Deployment、StatefulSet、DaemonSet 和 CronJob"
      activePath="/workloads"
      actions={(
        <button
          type="button"
          onClick={loadWorkloads}
          className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
          aria-label="刷新工作负载数据"
        >
          <RefreshCw size={18} />
        </button>
      )}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            <div className={clsx('relative flex-1 overflow-hidden rounded-xl border', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <Search className={clsx('absolute left-3 top-1/2 -translate-y-1/2', dark ? 'text-gray-500' : 'text-gray-400')} size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="搜索工作负载名称、类型或命名空间"
                className={clsx('w-full bg-transparent py-3 pl-10 pr-4 outline-none', dark ? 'placeholder:text-gray-500' : 'placeholder:text-gray-400')}
              />
            </div>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as 'all' | WorkloadItem['type'])}
              className={clsx('rounded-xl border px-4 py-3 outline-none', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}
            >
              <option value="all">全部类型</option>
              <option value="deployment">Deployment</option>
              <option value="statefulset">StatefulSet</option>
              <option value="daemonset">DaemonSet</option>
              <option value="cronjob">CronJob</option>
            </select>
            <select
              value={selectedNamespace}
              onChange={(event) => setSelectedNamespace(event.target.value)}
              className={clsx('rounded-xl border px-4 py-3 outline-none', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}
            >
              {namespaces.map((namespace) => (
                <option key={namespace} value={namespace}>{namespace}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>Deployment</div>
              <div className="mt-2 text-2xl font-bold">{typeCounts.deployment}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>StatefulSet</div>
              <div className="mt-2 text-2xl font-bold">{typeCounts.statefulset}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>DaemonSet</div>
              <div className="mt-2 text-2xl font-bold">{typeCounts.daemonset}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>CronJob</div>
              <div className="mt-2 text-2xl font-bold">{typeCounts.cronjob}</div>
            </div>
          </div>
        </div>

        <div className={clsx('overflow-hidden rounded-2xl border', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={dark ? 'bg-gray-950 text-gray-400' : 'bg-gray-50 text-gray-500'}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">名称</th>
                  <th className="px-4 py-3 text-left font-medium">类型</th>
                  <th className="px-4 py-3 text-left font-medium">命名空间</th>
                  <th className="px-4 py-3 text-left font-medium">就绪/期望</th>
                  <th className="px-4 py-3 text-left font-medium">镜像</th>
                  <th className="px-4 py-3 text-left font-medium">创建时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className={dark ? 'border-t border-gray-800' : 'border-t border-gray-200'}>
                      <td colSpan={7} className="px-4 py-4">
                        <div className={`h-10 animate-pulse rounded-xl ${dark ? 'bg-gray-800' : 'bg-gray-100'}`} />
                      </td>
                    </tr>
                  ))
                ) : filteredWorkloads.map((workload) => (
                  <tr key={workload.id} className={clsx(dark ? 'border-t border-gray-800 hover:bg-gray-950' : 'border-t border-gray-200 hover:bg-gray-50')}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Package size={16} className="text-blue-500" />
                        <div className="font-medium">{workload.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">{typeLabel[workload.type]}</td>
                    <td className="px-4 py-4">{workload.namespace}</td>
                    <td className="px-4 py-4">{workload.ready ?? 0}/{workload.desired ?? 0}</td>
                    <td className="px-4 py-4">
                      <div className="max-w-48 truncate">{workload.images.join(', ')}</div>
                    </td>
                    <td className="px-4 py-4">{workload.age}</td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => setSelectedWorkload(workload)} className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}>
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedWorkload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedWorkload(null)}>
          <div
            className={clsx('w-full max-w-3xl rounded-2xl border p-6 shadow-xl', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedWorkload.name}</h2>
                <p className={clsx('mt-1 text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>
                  {typeLabel[selectedWorkload.type]} · {selectedWorkload.namespace}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedWorkload(null)} className={clsx('rounded-lg px-3 py-2 text-sm', dark ? 'bg-gray-800' : 'bg-gray-100')}>
                关闭
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>副本情况</div>
                  <div className="mt-1 font-medium">就绪 {selectedWorkload.ready ?? 0} / 期望 {selectedWorkload.desired ?? 0}</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>可用 / 最新</div>
                  <div className="mt-1 font-medium">{selectedWorkload.available ?? 0} / {selectedWorkload.upToDate ?? 0}</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>其他</div>
                  <div className="mt-1 font-medium">{selectedWorkload.schedule || selectedWorkload.strategy || selectedWorkload.serviceName || '无'}</div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>镜像</div>
                  <div className="mt-2 space-y-2">
                    {selectedWorkload.images.map((image) => (
                      <div key={image} className={clsx('rounded-xl border p-3 text-sm', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50')}>
                        {image}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>标签</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(selectedWorkload.labels).map(([key, value]) => (
                      <span key={key} className={clsx('rounded-full px-3 py-1 text-xs', dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700')}>
                        {key}: {value}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
