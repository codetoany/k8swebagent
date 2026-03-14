import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';
import { 
  Server, BarChart3, Database, AlertTriangle, Network, Cpu, 
  HardDrive, Wifi, User, Settings, LogOut, Moon, Sun, 
  Menu, X, Search, Bell, ChevronDown, RefreshCw, PlusCircle,
  AlertCircle

} from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useContext } from 'react';
import { AuthContext } from '@/contexts/authContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/lib/apiClient';
import { dashboardAPI } from '@/lib/api';

// 模拟数据
const cpuUsageData = [
  { name: '00:00', usage: 30 },
  { name: '04:00', usage: 25 },
  { name: '08:00', usage: 45 },
  { name: '12:00', usage: 60 },
  { name: '16:00', usage: 70 },
  { name: '20:00', usage: 55 },
  { name: '现在', usage: 65 },
];

const memoryUsageData = [
  { name: '00:00', usage: 40 },
  { name: '04:00', usage: 35 },
  { name: '08:00', usage: 55 },
  { name: '12:00', usage: 75 },
  { name: '16:00', usage: 80 },
  { name: '20:00', usage: 70 },
  { name: '现在', usage: 78 },
];

const namespaceData = [
  { name: 'default', value: 12 },
  { name: 'kube-system', value: 18 },
  { name: 'kube-public', value: 3 },
  { name: 'dev', value: 8 },
  { name: 'prod', value: 15 },
];

const nodeStatusData = [
  { name: '在线', value: 5 },
  { name: '离线', value: 1 },
];

const podStatusData = [
  { name: '运行中', value: 45 },
  { name: '已暂停', value: 3 },
  { name: '失败', value: 2 },
  { name: '未知', value: 1 },
];

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];

const Dashboard = () => {
  const { theme, toggleTheme } = useThemeContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState({
    totalNodes: 6,
    onlineNodes: 5,
    offlineNodes: 1,
    totalPods: 45,
    runningPods: 40,
    failedPods: 2,
    pausedPods: 3,
    totalWorkloads: 15,
    cpuUsage: 65,
    memoryUsage: 78,
    diskUsage: 42,
  });
  const [cpuChartData, setCpuChartData] = useState(cpuUsageData);
  const [memoryChartData, setMemoryChartData] = useState(memoryUsageData);
  const [namespaceChartData, setNamespaceChartData] = useState(namespaceData);
  const [nodeChartData, setNodeChartData] = useState(nodeStatusData);
  const [podChartData, setPodChartData] = useState(podStatusData);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  // 处理登出
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 导航到其他页面
  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [overviewData, resourceUsage, namespaceDistribution, recentEventsData] = await Promise.all([
          apiClient.get<any>(dashboardAPI.getClusterOverview),
          apiClient.get<any[]>(dashboardAPI.getResourceUsage),
          apiClient.get<Array<{ name: string; value: number }>>(dashboardAPI.getNamespaceDistribution),
          apiClient.get<any[]>(dashboardAPI.getRecentEvents),
        ]);

        if (!active) {
          return;
        }

        if (overviewData) {
          setOverview((current) => ({ ...current, ...overviewData }));
          setNodeChartData([
            { name: '在线', value: overviewData.onlineNodes ?? 5 },
            { name: '离线', value: overviewData.offlineNodes ?? 1 },
          ]);
          setPodChartData([
            { name: '运行中', value: overviewData.runningPods ?? 40 },
            { name: '已暂停', value: overviewData.pausedPods ?? 3 },
            { name: '失败', value: overviewData.failedPods ?? 2 },
          ]);
        }

        if (Array.isArray(resourceUsage) && resourceUsage.length > 0) {
          setCpuChartData(resourceUsage.map((item) => ({ name: item.time, usage: item.cpuUsage })));
          setMemoryChartData(resourceUsage.map((item) => ({ name: item.time, usage: item.memoryUsage })));
        }

        if (Array.isArray(namespaceDistribution) && namespaceDistribution.length > 0) {
          setNamespaceChartData(namespaceDistribution);
        }

        if (Array.isArray(recentEventsData)) {
          setRecentEvents(recentEventsData);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const formatRelativeTime = (timestamp: string) => {
    const diffMinutes = Math.max(1, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
    if (diffMinutes < 60) {
      return `${diffMinutes} 分钟前`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} 小时前`;
    }
    return `${Math.round(diffHours / 24)} 天前`;
  };

  const getEventAccent = (type: string) => {
    if (type === 'warning' || type === 'error') {
      return {
        icon: AlertTriangle,
        iconClass: 'text-red-500',
        panelClass: theme === 'dark' ? 'bg-gray-700 border-red-900/30' : 'bg-red-50 border-red-100',
      };
    }
    if (type === 'success') {
      return {
        icon: Network,
        iconClass: 'text-blue-500',
        panelClass: theme === 'dark' ? 'bg-gray-700 border-blue-900/30' : 'bg-blue-50 border-blue-100',
      };
    }
    return {
      icon: Wifi,
      iconClass: 'text-green-500',
      panelClass: theme === 'dark' ? 'bg-gray-700 border-green-900/30' : 'bg-green-50 border-green-100',
    };
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.5,
        staggerChildren: 0.1
      }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.3 }
    }
  };

  const renderNavItem = (icon: React.ReactNode, label: string, path: string, active: boolean = false) => (
    <motion.div 
      variants={itemVariants}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-300
        ${active 
          ? theme === 'dark' 
            ? 'bg-blue-900/30 text-blue-400' 
            : 'bg-blue-50 text-blue-600' 
          : theme === 'dark' 
            ? 'hover:bg-gray-800 text-gray-300' 
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      onClick={() => navigateTo(path)}
    >
      <span className="text-lg">{icon}</span>
      <span className="font-medium">{label}</span>
    </motion.div>
  );

  return (
    <div className={`min-h-screen flex ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-300`}>
      {/* 侧边栏 - 移动端 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)}></div>
          <motion.div 
            className={`fixed top-0 left-0 h-full w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <Server className="text-blue-500" />
                <h2 className="text-xl font-bold">K8s Agent</h2>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-md hover:bg-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard', true)}
              {renderNavItem(<Server size={20} />, '节点', '/nodes')}
              {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
              {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
              {renderNavItem(<Settings size={20} />, '设置', '/settings')}
            </div>
          </motion.div>
        </div>
      )}

      {/* 侧边栏 - 桌面端 */}
      <div className={`hidden lg:flex lg:flex-col w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-r ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} h-screen fixed`}>
        <div className="p-4 border-b border-gray-700 flex items-center space-x-2">
          <Server className="text-blue-500" />
          <h2 className="text-xl font-bold">K8s Agent</h2>
        </div>
        <div className="p-4 space-y-1 flex-1 overflow-y-auto">
           {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard', true)}
          {renderNavItem(<Server size={20} />, '节点', '/nodes')}
          {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
          {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
          {renderNavItem(<Settings size={20} />, '设置', '/settings')}
          {renderNavItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
        </div>
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
                <User size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">管理员</div>
                <div className="text-xs opacity-70">admin@k8s-agent.com</div>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              aria-label="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 lg:ml-64">
        {/* 顶部导航栏 */}
        <header className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-gray-700"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-xl font-bold">仪表盘</h1>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={toggleTheme}
                className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} relative`}>
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
            </div>
          </div>
        </header>

        {/* 仪表盘内容 */}
        <main className="p-4 md:p-6">
          {loading ? (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className={`flex-1 p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse-slow`}>
                    <div className={`h-6 w-3/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} mb-4`}></div>
                    <div className={`h-8 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} mb-2`}></div>
                    <div className={`h-4 w-1/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`col-span-1 lg:col-span-2 p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse-slow h-80`}></div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse-slow h-80`}></div>
              </div>
            </div>
          ) : (
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              className="space-y-6"
            >
              {/* 状态卡片 */}
              <motion.div 
                variants={itemVariants}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'} transition-all duration-300 border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>集群节点</h3>
                    <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
                      <Server size={20} className="text-blue-500" />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold">{overview.totalNodes}</p>
                      <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span className="text-green-500">+1</span> 较上周
                      </p>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {overview.onlineNodes}/{overview.totalNodes} 在线
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'} transition-all duration-300 border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>运行中 Pods</h3>
                    <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100'}`}>
                      <Database size={20} className="text-green-500" />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold">{overview.totalPods}</p>
                      <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span className="text-green-500">+5</span> 较上周
                      </p>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {Math.round((overview.runningPods / Math.max(overview.totalPods, 1)) * 100)}% 可用
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'} transition-all duration-300 border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>CPU 使用率</h3>
                    <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-100'}`}>
                      <Cpu size={20} className="text-yellow-500" />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold">{overview.cpuUsage}%</p>
                      <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span className="text-red-500">+10%</span> 较上周
                      </p>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        中等负载
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'} transition-all duration-300 border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>内存使用率</h3>
                    <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-red-900/30' : 'bg-red-100'}`}>
                      <HardDrive size={20} className="text-red-500" />
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold">{overview.memoryUsage}%</p>
                      <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span className="text-red-500">+5%</span> 较上周
                      </p>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        高负载
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* 图表区域 */}
              <motion.div 
                variants={itemVariants}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* 资源使用图表 */}
                <div className={`col-span-1 lg:col-span-2 p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">资源使用情况</h3>
                    <div className="flex items-center space-x-2">
                      <button 
                        className={`text-xs px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                      >
                        今日
                      </button>
                      <button 
                        className={`text-xs px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}
                      >
                        本周
                      </button>
                      <button 
                        className={`text-xs px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}
                      >
                        本月
                      </button>
                      <button 
                        className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={cpuChartData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                            borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                            borderRadius: '0.5rem',
                            color: theme === 'dark' ? '#ffffff' : '#000000'
                          }}
                          formatter={(value) => [`${value}%`, '']}
                        />
                        <Legend 
                          wrapperStyle={{ paddingTop: 10 }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="usage" 
                          stroke="#3b82f6" 
                          fillOpacity={1} 
                          fill="url(#colorCpu)" 
                          name="CPU 使用率"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="usage" 
                          stroke="#ef4444" 
                          fillOpacity={1} 
                          fill="url(#colorMemory)" 
                          name="内存使用率"
                          data={memoryChartData}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 命名空间分布 */}
                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">命名空间分布</h3>
                    <button 
                      className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  <div className="h-72 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={namespaceChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {namespaceChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                            borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                            borderRadius: '0.5rem',
                            color: theme === 'dark' ? '#ffffff' : '#000000'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {namespaceChartData.map((namespace, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                          <span>{namespace.name}</span>
                        </div>
                        <span>{namespace.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* 状态统计 */}
              <motion.div 
                variants={itemVariants}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <h3 className="font-medium mb-4">节点状态</h3>
                  <div className="space-y-3">
                    {nodeChartData.map((status, index) => (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{status.name}</span>
                          <span>{status.value}</span>
                        </div>
                        <div className={`h-2 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                          <div 
                            className={`h-full rounded-full ${status.name === '在线' ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${(status.value / nodeChartData.reduce((sum, item) => sum + item.value, 0)) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <h3 className="font-medium mb-4">Pod 状态</h3>
                  <div className="space-y-3">
                    {podChartData.map((status, index) => (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{status.name}</span>
                          <span>{status.value}</span>
                        </div>
                        <div className={`h-2 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                          <div 
                            className={`h-full rounded-full`}
                            style={{ 
                              width: `${(status.value / podChartData.reduce((sum, item) => sum + item.value, 0)) * 100}%`,
                              backgroundColor: COLORS[index % COLORS.length]
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">最近事件</h3>
                    <button 
                      className={`text-xs flex items-center space-x-1 ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                    >
                      <span>查看全部</span>
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {(recentEvents.length > 0 ? recentEvents.slice(0, 3) : []).map((event) => {
                      const accent = getEventAccent(event.type);
                      const Icon = accent.icon;

                      return (
                        <div key={event.id} className={`p-3 rounded-lg border ${accent.panelClass}`}>
                          <div className="flex items-start space-x-2">
                            <Icon size={16} className={`${accent.iconClass} mt-0.5`} />
                            <div>
                              <p className="text-sm font-medium">{event.reason}</p>
                              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                {formatRelativeTime(event.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
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
