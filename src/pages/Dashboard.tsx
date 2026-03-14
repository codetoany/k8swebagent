import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Database,
  HardDrive,
  Server,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import AppShell from '@/components/AppShell';
import apiClient from '@/lib/apiClient';
import { dashboardAPI } from '@/lib/api';
import { useThemeContext } from '@/contexts/themeContext';

interface ClusterOverview {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  totalPods: number;
  runningPods: number;
  failedPods: number;
  pausedPods: number;
  totalWorkloads: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

interface ResourceUsagePoint {
  time: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

interface NamespaceDistribution {
  name: string;
  value: number;
}

interface RecentEvent {
  id: string;
  type: string;
  reason: string;
  message: string;
  timestamp: string;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const defaultOverview: ClusterOverview = {
  totalNodes: 0,
  onlineNodes: 0,
  offlineNodes: 0,
  totalPods: 0,
  runningPods: 0,
  failedPods: 0,
  pausedPods: 0,
  totalWorkloads: 0,
  cpuUsage: 0,
  memoryUsage: 0,
  diskUsage: 0,
};

export default function Dashboard() {
  const { theme } = useThemeContext();
  const dark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(defaultOverview);
  const [resourceUsage, setResourceUsage] = useState<ResourceUsagePoint[]>([]);
  const [namespaceDistribution, setNamespaceDistribution] = useState<NamespaceDistribution[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [overviewData, usageData, namespaceData, eventData] = await Promise.all([
          apiClient.get<ClusterOverview>(dashboardAPI.getClusterOverview),
          apiClient.get<ResourceUsagePoint[]>(dashboardAPI.getResourceUsage),
          apiClient.get<NamespaceDistribution[]>(dashboardAPI.getNamespaceDistribution),
          apiClient.get<RecentEvent[]>(dashboardAPI.getRecentEvents),
        ]);

        if (cancelled) {
          return;
        }

        setOverview(overviewData);
        setResourceUsage(usageData);
        setNamespaceDistribution(namespaceData);
        setRecentEvents(eventData);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(() => {
    return resourceUsage.map((item) => ({
      time: item.time,
      cpu: item.cpuUsage,
      memory: item.memoryUsage,
    }));
  }, [resourceUsage]);

  const statCards = [
    {
      label: '集群节点',
      value: overview.totalNodes,
      detail: `${overview.onlineNodes}/${overview.totalNodes} 在线`,
      icon: <Server size={20} className="text-blue-500" />,
    },
    {
      label: 'Pods',
      value: overview.totalPods,
      detail: `${overview.runningPods} 运行中`,
      icon: <Database size={20} className="text-green-500" />,
    },
    {
      label: 'CPU 使用率',
      value: `${overview.cpuUsage}%`,
      detail: '当前集群平均值',
      icon: <Cpu size={20} className="text-amber-500" />,
    },
    {
      label: '内存使用率',
      value: `${overview.memoryUsage}%`,
      detail: `磁盘 ${overview.diskUsage}%`,
      icon: <HardDrive size={20} className="text-rose-500" />,
    },
  ];

  return (
    <AppShell title="仪表盘" description="实时查看集群概况、资源趋势和最近事件" activePath="/dashboard">
      {loading ? (
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className={`h-32 animate-pulse rounded-2xl ${dark ? 'bg-gray-900' : 'bg-white'}`} />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <div className={`h-96 rounded-2xl xl:col-span-2 ${dark ? 'bg-gray-900' : 'bg-white'}`} />
            <div className={`h-96 rounded-2xl ${dark ? 'bg-gray-900' : 'bg-white'}`} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl border p-5 shadow-sm ${dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>{card.label}</div>
                  <div className={`rounded-xl p-2 ${dark ? 'bg-gray-800' : 'bg-gray-50'}`}>{card.icon}</div>
                </div>
                <div className="text-3xl font-bold">{card.value}</div>
                <div className={`mt-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{card.detail}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className={`rounded-2xl border p-5 shadow-sm xl:col-span-2 ${dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">资源使用趋势</h2>
                <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>CPU / 内存</div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1f2937' : '#e5e7eb'} />
                    <XAxis dataKey="time" stroke={dark ? '#94a3b8' : '#64748b'} />
                    <YAxis stroke={dark ? '#94a3b8' : '#64748b'} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dark ? '#111827' : '#ffffff',
                        borderColor: dark ? '#374151' : '#e5e7eb',
                        color: dark ? '#ffffff' : '#0f172a',
                      }}
                    />
                    <Area type="monotone" dataKey="cpu" stroke="#2563eb" fill="url(#cpuGradient)" name="CPU" />
                    <Area type="monotone" dataKey="memory" stroke="#ef4444" fill="url(#memoryGradient)" name="内存" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 shadow-sm ${dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">命名空间分布</h2>
                <div className={dark ? 'text-sm text-gray-400' : 'text-sm text-gray-500'}>Pods 数量</div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={namespaceDistribution} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={2}>
                      {namespaceDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dark ? '#111827' : '#ffffff',
                        borderColor: dark ? '#374151' : '#e5e7eb',
                        color: dark ? '#ffffff' : '#0f172a',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {namespaceDistribution.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span>{item.name}</span>
                    </div>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className={`rounded-2xl border p-5 shadow-sm ${dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              <h2 className="mb-4 text-lg font-semibold">节点状态</h2>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>在线</span>
                    <span>{overview.onlineNodes}</span>
                  </div>
                  <div className={`h-2 rounded-full ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <div className="h-2 rounded-full bg-green-500" style={{ width: `${overview.totalNodes ? (overview.onlineNodes / overview.totalNodes) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>离线</span>
                    <span>{overview.offlineNodes}</span>
                  </div>
                  <div className={`h-2 rounded-full ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <div className="h-2 rounded-full bg-red-500" style={{ width: `${overview.totalNodes ? (overview.offlineNodes / overview.totalNodes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 shadow-sm ${dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              <h2 className="mb-4 text-lg font-semibold">Pod 状态</h2>
              <div className="space-y-4">
                {[
                  { label: '运行中', value: overview.runningPods, color: '#10b981' },
                  { label: '已暂停', value: overview.pausedPods, color: '#f59e0b' },
                  { label: '失败', value: overview.failedPods, color: '#ef4444' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                    <div className={`h-2 rounded-full ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <div className="h-2 rounded-full" style={{ width: `${overview.totalPods ? (item.value / overview.totalPods) * 100 : 0}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-2xl border p-5 shadow-sm ${dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              <h2 className="mb-4 text-lg font-semibold">最近事件</h2>
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <div key={event.id} className={`rounded-xl border p-3 ${dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={event.type === 'error' || event.type === 'warning' ? 'mt-0.5 text-amber-500' : 'mt-0.5 text-blue-500'} size={16} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{event.reason}</div>
                        <div className={`mt-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{event.message}</div>
                        <div className={`mt-2 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(event.timestamp).toLocaleString('zh-CN')}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
