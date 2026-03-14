import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Search, Server } from 'lucide-react';

import AppShell from '@/components/AppShell';
import apiClient from '@/lib/apiClient';
import { nodesAPI } from '@/lib/api';
import { useThemeContext } from '@/contexts/themeContext';

interface NodeItem {
  id: string;
  name: string;
  status: string;
  cpuUsage: number;
  memoryUsage: number;
  pods: number;
  ip: string;
  os: string;
  kernelVersion: string;
  kubeletVersion: string;
  capacity: { cpu: string; memory: string; pods: string };
  allocatable: { cpu: string; memory: string; pods: string };
  labels: Record<string, string>;
  taints?: string[];
}

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function Nodes() {
  const { theme } = useThemeContext();
  const dark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);

  async function loadNodes() {
    setLoading(true);
    try {
      const data = await apiClient.get<NodeItem[]>(nodesAPI.listNodes);
      setNodes(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNodes();
  }, []);

  const filteredNodes = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return nodes;
    }

    return nodes.filter((node) =>
      [node.name, node.ip, node.status, node.os].some((field) => field.toLowerCase().includes(keyword)),
    );
  }, [nodes, searchTerm]);

  const stats = {
    total: nodes.length,
    online: nodes.filter((node) => node.status === 'online').length,
    offline: nodes.filter((node) => node.status !== 'online').length,
    pods: nodes.reduce((sum, node) => sum + node.pods, 0),
  };

  return (
    <AppShell
      title="节点管理"
      description="查看节点状态、资源使用和节点基础信息"
      activePath="/nodes"
      actions={(
        <button
          type="button"
          onClick={loadNodes}
          className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
          aria-label="刷新节点数据"
        >
          <RefreshCw size={18} />
        </button>
      )}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className={clsx('relative max-w-md flex-1 overflow-hidden rounded-xl border', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
            <Search className={clsx('absolute left-3 top-1/2 -translate-y-1/2', dark ? 'text-gray-500' : 'text-gray-400')} size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索节点名称、IP 或状态"
              className={clsx('w-full bg-transparent py-3 pl-10 pr-4 outline-none', dark ? 'placeholder:text-gray-500' : 'placeholder:text-gray-400')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>总节点数</div>
              <div className="mt-2 text-2xl font-bold">{stats.total}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>在线</div>
              <div className="mt-2 text-2xl font-bold text-green-500">{stats.online}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>离线</div>
              <div className="mt-2 text-2xl font-bold text-red-500">{stats.offline}</div>
            </div>
            <div className={clsx('rounded-2xl border p-4', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>Pods</div>
              <div className="mt-2 text-2xl font-bold">{stats.pods}</div>
            </div>
          </div>
        </div>

        <div className={clsx('overflow-hidden rounded-2xl border', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={dark ? 'bg-gray-950 text-gray-400' : 'bg-gray-50 text-gray-500'}>
                <tr>
                  <th className="px-4 py-3 text-left font-medium">节点</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-left font-medium">CPU</th>
                  <th className="px-4 py-3 text-left font-medium">内存</th>
                  <th className="px-4 py-3 text-left font-medium">Pods</th>
                  <th className="px-4 py-3 text-left font-medium">IP</th>
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
                ) : filteredNodes.map((node) => (
                  <tr key={node.id} className={clsx(dark ? 'border-t border-gray-800 hover:bg-gray-950' : 'border-t border-gray-200 hover:bg-gray-50')}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Server size={16} className={node.status === 'online' ? 'text-green-500' : 'text-red-500'} />
                        <div>
                          <div className="font-medium">{node.name}</div>
                          <div className={clsx('text-xs', dark ? 'text-gray-500' : 'text-gray-400')}>{node.os}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={clsx(
                        'rounded-full px-2.5 py-1 text-xs font-medium',
                        node.status === 'online'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700',
                      )}>
                        {node.status === 'online' ? '在线' : '离线'}
                      </span>
                    </td>
                    <td className="px-4 py-4">{node.cpuUsage}%</td>
                    <td className="px-4 py-4">{node.memoryUsage}%</td>
                    <td className="px-4 py-4">{node.pods}</td>
                    <td className="px-4 py-4">{node.ip}</td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => setSelectedNode(node)} className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}>
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

      {selectedNode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedNode(null)}>
          <div
            className={clsx('w-full max-w-3xl rounded-2xl border p-6 shadow-xl', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedNode.name}</h2>
                <p className={clsx('mt-1 text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{selectedNode.ip}</p>
              </div>
              <button type="button" onClick={() => setSelectedNode(null)} className={clsx('rounded-lg px-3 py-2 text-sm', dark ? 'bg-gray-800' : 'bg-gray-100')}>
                关闭
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>状态</div>
                  <div className="mt-1 font-medium">{selectedNode.status === 'online' ? '在线' : '离线'}</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>操作系统</div>
                  <div className="mt-1 font-medium">{selectedNode.os}</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>Kernel / Kubelet</div>
                  <div className="mt-1 font-medium">{selectedNode.kernelVersion}</div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{selectedNode.kubeletVersion}</div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>资源使用</div>
                  <div className="mt-1 font-medium">CPU {selectedNode.cpuUsage}% / 内存 {selectedNode.memoryUsage}%</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>容量</div>
                  <div className="mt-1 font-medium">CPU {selectedNode.capacity.cpu} / 内存 {selectedNode.capacity.memory} / Pods {selectedNode.capacity.pods}</div>
                </div>
                <div>
                  <div className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>标签</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(selectedNode.labels).map(([key, value]) => (
                      <span key={key} className={clsx('rounded-full px-3 py-1 text-xs', dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700')}>
                        {value ? `${key}: ${value}` : key}
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
