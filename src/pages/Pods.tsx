import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Search } from 'lucide-react';

import AppShell from '@/components/AppShell';
import apiClient from '@/lib/apiClient';
import { namespacesAPI, podsAPI } from '@/lib/api';
import { useThemeContext } from '@/contexts/themeContext';

interface PodContainer {
  name: string;
  ready: boolean;
  restartCount: number;
  image: string;
}

interface PodItem {
  id: string;
  name: string;
  namespace: string;
  status: string;
  node: string;
  ip: string;
  containers: PodContainer[];
  age: string;
  cpuUsage: number;
  memoryUsage: number;
  labels: Record<string, string>;
}

interface NamespaceItem {
  name: string;
}

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function Pods() {
  const { theme } = useThemeContext();
  const dark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [pods, setPods] = useState<PodItem[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>(['全部']);
  const [selectedNamespace, setSelectedNamespace] = useState('全部');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPod, setSelectedPod] = useState<PodItem | null>(null);

  async function loadPods() {
    setLoading(true);
    try {
      const [podData, namespaceData] = await Promise.all([
        apiClient.get<PodItem[]>(podsAPI.listPods),
        apiClient.get<NamespaceItem[]>(namespacesAPI.listNamespaces),
      ]);
      setPods(podData);
      setNamespaces(['全部', ...namespaceData.map((item) => item.name)]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPods();
  }, []);

  const filteredPods = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return pods.filter((pod) => {
      const matchesNamespace = selectedNamespace === '全部' || pod.namespace === selectedNamespace;
      const matchesKeyword = !keyword || [pod.name, pod.namespace, pod.node, pod.status].some((field) => field.toLowerCase().includes(keyword));
      return matchesNamespace && matchesKeyword;
    });
  }, [pods, searchTerm, selectedNamespace]);

  const stats = {
    total: pods.length,
    running: pods.filter((pod) => pod.status === 'running').length,
    paused: pods.filter((pod) => pod.status === 'paused').length,
    failed: pods.filter((pod) => pod.status === 'failed').length,
  };

  const statusClassName = (status: string) => {
    if (status === 'running') return 'bg-green-100 text-green-700';
    if (status === 'failed') return 'bg-red-100 text-red-700';
    if (status === 'paused') return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-700';
  };

  return (
    <AppShell
      title="Pods 管理"
      description="按命名空间查看 Pod 状态、容器信息和资源使用"
      activePath="/pods"
      actions={(
        <button
          type="button"
          onClick={loadPods}
          className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
          aria-label="刷新 Pod 数据"
        >
          <RefreshCw size={18} />
        </button>
      )}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 sm:flex-row">
            <div className={clsx('relative flex-1 overflow-hidden rounded-xl border', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <Search className={clsx('absolute left-3 top-1/2 -translate-y-1/2', dark ? 'text-gray-500' : 'text-gray-400')} size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="搜索 Pod 名称、节点或状态"
                className={clsx('w-full bg-transparent py-3 pl-10 pr-4 outline-none', dark ? 'placeholder:text-gray-500' : 'placeholder:text-gray-400')}
              />
            </div>
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
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>总数</div>
              <div className="mt-2 text-2xl font-bold">{stats.total}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>运行中</div>
              <div className="mt-2 text-2xl font-bold text-green-500">{stats.running}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>暂停</div>
              <div className="mt-2 text-2xl font-bold text-amber-500">{stats.paused}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>失败</div>
              <div className="mt-2 text-2xl font-bold text-red-500">{stats.failed}</div>
            </div>
          </div>
        </div>

        <div className={clsx('overflow-hidden rounded-2xl border', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={dark ? 'bg-gray-950 text-gray-400' : 'bg-gray-50 text-gray-500'}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Pod</th>
                  <th className="px-4 py-3 text-left font-medium">命名空间</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-left font-medium">节点</th>
                  <th className="px-4 py-3 text-left font-medium">容器</th>
                  <th className="px-4 py-3 text-left font-medium">资源</th>
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
                ) : filteredPods.map((pod) => (
                  <tr key={pod.id} className={clsx(dark ? 'border-t border-gray-800 hover:bg-gray-950' : 'border-t border-gray-200 hover:bg-gray-50')}>
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-medium">{pod.name}</div>
                        <div className={clsx('text-xs', dark ? 'text-gray-500' : 'text-gray-400')}>{pod.ip}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">{pod.namespace}</td>
                    <td className="px-4 py-4">
                      <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', statusClassName(pod.status))}>
                        {pod.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">{pod.node}</td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        {pod.containers.slice(0, 2).map((container) => (
                          <div key={container.name} className="text-xs">
                            {container.ready ? '就绪' : '未就绪'} · {container.name}
                          </div>
                        ))}
                        {pod.containers.length > 2 ? (
                          <div className={clsx('text-xs', dark ? 'text-gray-500' : 'text-gray-400')}>+{pod.containers.length - 2} 个容器</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs">
                        <div>CPU {pod.cpuUsage}m</div>
                        <div>内存 {pod.memoryUsage}Mi</div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => setSelectedPod(pod)} className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}>
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

      {selectedPod ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedPod(null)}>
          <div
            className={clsx('w-full max-w-3xl rounded-2xl border p-6 shadow-xl', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedPod.name}</h2>
                <p className={clsx('mt-1 text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{selectedPod.namespace} / {selectedPod.node}</p>
              </div>
              <button type="button" onClick={() => setSelectedPod(null)} className={clsx('rounded-lg px-3 py-2 text-sm', dark ? 'bg-gray-800' : 'bg-gray-100')}>
                关闭
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>基础信息</div>
                  <div className="mt-1 font-medium">{selectedPod.status} · {selectedPod.age}</div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{selectedPod.ip}</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>资源使用</div>
                  <div className="mt-1 font-medium">CPU {selectedPod.cpuUsage}m / 内存 {selectedPod.memoryUsage}Mi</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>标签</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(selectedPod.labels).map(([key, value]) => (
                      <span key={key} className={clsx('rounded-full px-3 py-1 text-xs', dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700')}>
                        {key}: {value}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>容器</div>
                <div className="mt-2 space-y-3">
                  {selectedPod.containers.map((container) => (
                    <div key={container.name} className={clsx('rounded-xl border p-3', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50')}>
                      <div className="font-medium">{container.name}</div>
                      <div className={clsx('mt-1 text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{container.image}</div>
                      <div className="mt-2 text-xs">
                        {container.ready ? '就绪' : '未就绪'} · 重启 {container.restartCount} 次
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
