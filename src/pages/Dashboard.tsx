import { useContext, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, AlertTriangle, BarChart3, Bell, ChevronDown, Cpu, Database, HardDrive, LogOut, Menu, Moon, Network, RefreshCw, Server, Settings, Sun, User, Wifi, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/authContext';
import { useClusterContext } from '@/contexts/clusterContext';
import { useThemeContext } from '@/contexts/themeContext';
import ClusterSelector from '@/components/ClusterSelector';
import { dashboardAPI } from '@/lib/api';
import apiClient from '@/lib/apiClient';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];
type TimeRange = 'today' | 'week' | 'month';
type Overview = { totalNodes: number; onlineNodes: number; offlineNodes: number; totalPods: number; runningPods: number; failedPods: number; pausedPods: number; totalWorkloads: number; cpuUsage: number; memoryUsage: number; diskUsage: number };
type ResourceUsagePoint = { time: string; cpuUsage: number; memoryUsage: number; diskUsage: number };
type NamespaceDistribution = { name: string; value: number };
type DashboardEvent = { id: string; type: string; reason: string; timestamp: string };

const EMPTY_OVERVIEW: Overview = { totalNodes: 0, onlineNodes: 0, offlineNodes: 0, totalPods: 0, runningPods: 0, failedPods: 0, pausedPods: 0, totalWorkloads: 0, cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };

const Dashboard = () => {
  const { theme, toggleTheme } = useThemeContext();
  const { enabledClusters, loading: clustersLoading, selectedCluster, setSelectedClusterId } = useClusterContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resourceUsageLoading, setResourceUsageLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [resourceRefreshVersion, setResourceRefreshVersion] = useState(0);
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [resourceUsageData, setResourceUsageData] = useState<ResourceUsagePoint[]>([]);
  const [namespaceChartData, setNamespaceChartData] = useState<NamespaceDistribution[]>([]);
  const [recentEvents, setRecentEvents] = useState<DashboardEvent[]>([]);

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.5, staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.3 } } };

  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [overviewData, namespaceDistribution, recentEventsData] = await Promise.all([
          apiClient.get<Partial<Overview>>(dashboardAPI.getClusterOverview, selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined),
          apiClient.get<NamespaceDistribution[]>(dashboardAPI.getNamespaceDistribution, selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined),
          apiClient.get<DashboardEvent[]>(dashboardAPI.getRecentEvents, selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined),
        ]);
        if (!active) return;
        setOverview({ ...EMPTY_OVERVIEW, ...overviewData });
        setNamespaceChartData(Array.isArray(namespaceDistribution) ? namespaceDistribution : []);
        setRecentEvents(Array.isArray(recentEventsData) ? recentEventsData : []);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    return () => { active = false; };
  }, [selectedCluster?.id]);

  useEffect(() => {
    let active = true;
    const requestParams = selectedCluster?.id
      ? { clusterId: selectedCluster.id, range: timeRange }
      : { range: timeRange };

    const loadResourceUsage = async () => {
      setResourceUsageLoading(true);
      try {
        const resourceUsage = await apiClient.get<ResourceUsagePoint[]>(dashboardAPI.getResourceUsage, requestParams);
        if (!active) return;
        setResourceUsageData(Array.isArray(resourceUsage) ? resourceUsage : []);
      } finally {
        if (active) setResourceUsageLoading(false);
      }
    };

    void loadResourceUsage();
    return () => { active = false; };
  }, [selectedCluster?.id, timeRange, resourceRefreshVersion]);

  const formatAbsoluteTime = (timestamp: string) => {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return '--';
    return parsed.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatRelativeTime = (timestamp: string) => {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return '--';
    const diffMs = Date.now() - parsed.getTime();
    if (diffMs <= 0) return '刚刚';
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} 天前`;
    return formatAbsoluteTime(timestamp);
  };

  const getEventAccent = (type: string) => {
    if (type === 'warning' || type === 'error') return { Icon: AlertTriangle, iconClass: 'text-red-500', panelClass: theme === 'dark' ? 'bg-gray-700 border-red-900/30' : 'bg-red-50 border-red-100' };
    if (type === 'success') return { Icon: Network, iconClass: 'text-blue-500', panelClass: theme === 'dark' ? 'bg-gray-700 border-blue-900/30' : 'bg-blue-50 border-blue-100' };
    return { Icon: Wifi, iconClass: 'text-green-500', panelClass: theme === 'dark' ? 'bg-gray-700 border-green-900/30' : 'bg-green-50 border-green-100' };
  };

  const getLoadLevel = (value: number) => (value >= 80 ? '高负载' : value >= 50 ? '中等负载' : '低负载');
  const getLoadAppearance = (value: number) => {
    if (value >= 80) return { wrapper: theme === 'dark' ? 'bg-red-900/30' : 'bg-red-100', icon: 'text-red-500', badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    if (value >= 50) return { wrapper: theme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-100', icon: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { wrapper: theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100', icon: 'text-green-500', badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
  };

  const displayResourceUsage = useMemo(() => {
    if (resourceUsageData.length === 0) return [];
    return resourceUsageData.map((item) => ({ name: item.time, ...item }));
  }, [resourceUsageData]);

  const nodeStatusData = useMemo(() => [{ name: '在线', value: overview.onlineNodes, className: 'bg-green-500' }, { name: '离线', value: overview.offlineNodes, className: 'bg-red-500' }], [overview.offlineNodes, overview.onlineNodes]);
  const podStatusData = useMemo(() => [{ name: '运行中', value: overview.runningPods }, { name: '已暂停', value: overview.pausedPods }, { name: '失败', value: overview.failedPods }], [overview.failedPods, overview.pausedPods, overview.runningPods]);
  const cpuLoadAppearance = getLoadAppearance(overview.cpuUsage);
  const memoryLoadAppearance = getLoadAppearance(overview.memoryUsage);

  const navItem = (icon: React.ReactNode, label: string, path: string, active = false) => (
    <motion.div variants={itemVariants} className={`flex items-center space-x-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-300 ${active ? (theme === 'dark' ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600') : theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`} onClick={() => navigateTo(path)}>
      <span className="text-lg">{icon}</span>
      <span className="font-medium">{label}</span>
    </motion.div>
  );

  const cardShell = `${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border shadow-sm`;
  const metricCards = [
    { title: '集群节点', value: `${overview.totalNodes}`, subtitle: '当前集群实时数据', badge: `${overview.onlineNodes}/${overview.totalNodes} 在线`, wrapper: theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100', icon: <Server size={20} className="text-blue-500" /> },
    { title: '运行中 Pods', value: `${overview.totalPods}`, subtitle: `运行中 ${overview.runningPods} 个`, badge: `${Math.round((overview.runningPods / Math.max(overview.totalPods, 1)) * 100)}% 可用`, wrapper: theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100', icon: <Database size={20} className="text-green-500" /> },
    { title: 'CPU 使用率', value: `${overview.cpuUsage}%`, subtitle: '当前集群实时数据', badge: getLoadLevel(overview.cpuUsage), badgeClass: cpuLoadAppearance.badge, wrapper: cpuLoadAppearance.wrapper, icon: <Cpu size={20} className={cpuLoadAppearance.icon} /> },
    { title: '内存使用率', value: `${overview.memoryUsage}%`, subtitle: '当前集群实时数据', badge: getLoadLevel(overview.memoryUsage), badgeClass: memoryLoadAppearance.badge, wrapper: memoryLoadAppearance.wrapper, icon: <HardDrive size={20} className={memoryLoadAppearance.icon} /> },
  ];

  return (
    <div className={`min-h-screen flex ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-300`}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)}></div>
          <motion.div className={`fixed top-0 left-0 h-full w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-lg`} initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.3 }}>
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center space-x-2"><Server className="text-blue-500" /><h2 className="text-xl font-bold">K8s Agent</h2></div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-md hover:bg-gray-700"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-1">
              {navItem(<BarChart3 size={20} />, '仪表盘', '/dashboard', true)}
              {navItem(<Server size={20} />, '节点', '/nodes')}
              {navItem(<Database size={20} />, 'Pods', '/pods')}
              {navItem(<Network size={20} />, '工作负载', '/workloads')}
              {navItem(<Settings size={20} />, '设置', '/settings')}
              {navItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
            </div>
          </motion.div>
        </div>
      )}

      <div className={`hidden lg:flex lg:flex-col w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-r ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} h-screen fixed`}>
        <div className="p-4 border-b border-gray-700 flex items-center space-x-2"><Server className="text-blue-500" /><h2 className="text-xl font-bold">K8s Agent</h2></div>
        <div className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navItem(<BarChart3 size={20} />, '仪表盘', '/dashboard', true)}
          {navItem(<Server size={20} />, '节点', '/nodes')}
          {navItem(<Database size={20} />, 'Pods', '/pods')}
          {navItem(<Network size={20} />, '工作负载', '/workloads')}
          {navItem(<Settings size={20} />, '设置', '/settings')}
          {navItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
        </div>
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}><User size={16} /></div>
              <div><div className="text-sm font-medium">管理员</div><div className="text-xs opacity-70">admin@k8s-agent.com</div></div>
            </div>
            <button onClick={() => { logout(); navigate('/'); }} className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`} aria-label="退出登录"><LogOut size={18} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 lg:ml-64">
        <header className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md hover:bg-gray-700"><Menu size={20} /></button>
              <h1 className="text-xl font-bold">仪表盘</h1>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={toggleTheme} className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`} aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
              <button className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} relative`}><Bell size={20} /><span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span></button>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {loading ? (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">{[1, 2, 3, 4].map((item) => <div key={item} className={`flex-1 p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse-slow`}><div className={`h-6 w-3/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} mb-4`}></div><div className={`h-8 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} mb-2`}></div><div className={`h-4 w-1/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div></div>)}</div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className={`col-span-1 lg:col-span-2 p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse-slow h-80`}></div><div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse-slow h-80`}></div></div>
            </div>
          ) : (
            <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
              <motion.div variants={itemVariants} className={`p-4 rounded-xl flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${cardShell}`}>
                <div><h2 className="text-lg font-semibold">当前资源集群</h2><p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{selectedCluster?.name || '未选择集群'}</p></div>
                <ClusterSelector theme={theme} clusters={enabledClusters} value={selectedCluster?.id || ''} loading={clustersLoading} onChange={setSelectedClusterId} className="w-full md:w-64" />
              </motion.div>

              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((card) => (
                  <div key={card.title} className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'} transition-all duration-300 border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                    <div className="flex items-center justify-between mb-3"><h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{card.title}</h3><div className={`p-2 rounded-lg ${card.wrapper}`}>{card.icon}</div></div>
                    <div className="flex items-end justify-between">
                      <div><p className="text-2xl font-bold">{card.value}</p><p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{card.subtitle}</p></div>
                      <div className="flex items-center"><span className={`text-xs px-2 py-1 rounded-full ${card.badgeClass || 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`}>{card.badge}</span></div>
                    </div>
                  </div>
                ))}
              </motion.div>

              <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`col-span-1 lg:col-span-2 p-5 rounded-xl ${cardShell}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">资源使用情况</h3>
                    <div className="flex items-center space-x-2">
                      {[{ key: 'today' as const, label: '今日' }, { key: 'week' as const, label: '本周' }, { key: 'month' as const, label: '本月' }].map((option) => {
                        const active = timeRange === option.key;
                        return <button key={option.key} type="button" onClick={() => setTimeRange(option.key)} className={`text-xs px-3 py-1 rounded-full transition-colors ${active ? (theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900') : `${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}`} disabled={resourceUsageLoading && active}>{option.label}</button>;
                      })}
                      <button type="button" onClick={() => setResourceRefreshVersion((current) => current + 1)} className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`} aria-label="刷新资源图表" disabled={resourceUsageLoading}><RefreshCw size={16} className={resourceUsageLoading ? 'animate-spin' : ''} /></button>
                    </div>
                  </div>
                  <div className="relative h-72">
                    {resourceUsageLoading && !loading && (
                      <div className={`absolute inset-0 z-10 flex items-center justify-center rounded-lg ${theme === 'dark' ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur-[1px]`}>
                        <div className={`flex items-center space-x-2 text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-600'}`}>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>正在刷新图表...</span>
                        </div>
                      </div>
                    )}
                    <div className={`h-full transition-opacity duration-200 ${resourceUsageLoading && !loading ? 'opacity-40' : 'opacity-100'}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={displayResourceUsage} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs><linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient><linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient></defs>
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                          <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb', borderRadius: '0.5rem', color: theme === 'dark' ? '#ffffff' : '#000000' }} formatter={(value) => [`${value}%`, '']} />
                          <Legend wrapperStyle={{ paddingTop: 10 }} />
                          <Area type="monotone" dataKey="cpuUsage" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCpu)" name="CPU 使用率" />
                          <Area type="monotone" dataKey="memoryUsage" stroke="#ef4444" fillOpacity={1} fill="url(#colorMemory)" name="内存使用率" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-xl ${cardShell}`}>
                  <div className="flex items-center justify-between mb-4"><h3 className="font-medium">命名空间分布</h3><button className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}><ChevronDown size={16} /></button></div>
                  <div className="h-72 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={namespaceChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">{namespaceChartData.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie>
                        <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb', borderRadius: '0.5rem', color: theme === 'dark' ? '#ffffff' : '#000000' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 gap-2 mt-2">{namespaceChartData.map((namespace, index) => <div key={`${namespace.name}-${index}`} className="flex items-center justify-between text-sm"><div className="flex items-center space-x-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div><span>{namespace.name}</span></div><span>{namespace.value}</span></div>)}</div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[{ title: '节点状态', items: nodeStatusData, getClassName: (item: { className: string }) => item.className }, { title: 'Pod 状态', items: podStatusData, getClassName: (_item: unknown, index: number) => '' }].map((panel, panelIndex) => {
                  const total = Math.max(panel.items.reduce((sum, item) => sum + item.value, 0), 1);
                  return (
                    <div key={panel.title} className={`p-5 rounded-xl ${cardShell}`}>
                      <h3 className="font-medium mb-4">{panel.title}</h3>
                      <div className="space-y-3">
                        {panel.items.map((item, index) => (
                          <div key={item.name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm"><span>{item.name}</span><span>{item.value}</span></div>
                            <div className={`h-2 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                              <div className={`h-full rounded-full ${panelIndex === 0 ? panel.getClassName(item as { className: string }, index) : ''}`} style={{ width: `${(item.value / total) * 100}%`, backgroundColor: panelIndex === 1 ? COLORS[index % COLORS.length] : undefined }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className={`p-5 rounded-xl ${cardShell}`}>
                  <div className="flex items-center justify-between mb-4"><h3 className="font-medium">最近事件</h3><button className={`text-xs flex items-center space-x-1 ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}><span>查看全部</span><ChevronDown size={14} /></button></div>
                  <div className="space-y-4">
                    {recentEvents.slice(0, 3).map((event) => {
                      const { Icon, iconClass, panelClass } = getEventAccent(event.type);
                      return <div key={event.id} className={`p-3 rounded-lg border ${panelClass}`}><div className="flex items-start space-x-2"><Icon size={16} className={`${iconClass} mt-0.5`} /><div className="min-w-0"><p className="text-sm font-medium">{event.reason}</p><p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} title={formatAbsoluteTime(event.timestamp)}>{formatAbsoluteTime(event.timestamp)} ({formatRelativeTime(event.timestamp)})</p></div></div></div>;
                    })}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
