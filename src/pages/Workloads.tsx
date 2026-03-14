import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
  import { 
    Server, BarChart3, Database, Network, Settings, LogOut, 
    Moon, Sun, Menu, X, Search, Bell, ChevronDown, 
    RefreshCw, PlusCircle, MoreVertical, Filter, Download,
    AlertCircle, CheckCircle, ArrowUpDown, Eye, Package, 
    Layers, Repeat, CircleSlash, GitBranch, User,
    BarChart
  } from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useContext } from 'react';
import { AuthContext } from '@/contexts/authContext';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/lib/apiClient';
import { namespacesAPI, workloadsAPI } from '@/lib/api';

// 模拟工作负载数据
const workloadsData = [
  {
    id: 'web-app-deployment',
    name: 'web-app',
    type: 'deployment',
    namespace: 'default',
    ready: 3,
    desired: 3,
    available: 3,
    upToDate: 3,
    age: '5d',
    images: ['nginx:1.23'],
    labels: {
      'app': 'web-app',
      'version': 'v1'
    }
  },
  {
    id: 'api-server-deployment',
    name: 'api-server',
    type: 'deployment',
    namespace: 'default',
    ready: 2,
    desired: 2,
    available: 2,
    upToDate: 2,
    age: '3d',
    images: ['my-api:v2.1.0'],
    labels: {
      'app': 'api-server',
      'environment': 'production'
    }
  },
  {
    id: 'database-statefulset',
    name: 'database',
    type: 'statefulset',
    namespace: 'default',
    ready: 1,
    desired: 1,
    available: 1,
    upToDate: 1,
    age: '7d',
    images: ['postgres:14'],
    labels: {
      'app': 'database',
      'db': 'postgres'
    }
  },
  {
    id: 'worker-daemonset',
    name: 'worker',
    type: 'daemonset',
    namespace: 'default',
    ready: 6,
    desired: 6,
    available: 5,
    upToDate: 5,
    age: '2d',
    images: ['worker:v1.3.0'],
    labels: {
      'app': 'worker',
      'queue': 'tasks'
    }
  },
  {
    id: 'monitoring-deployment',
    name: 'monitoring',
    type: 'deployment',
    namespace: 'kube-system',
    ready: 1,
    desired: 1,
    available: 1,
    upToDate: 1,
    age: '10d',
    images: ['prometheus:latest', 'grafana:latest'],
    labels: {
      'app': 'monitoring',
      'component': 'metrics'
    }
  },
  {
    id: 'cron-job',
    name: 'daily-backup',
    type: 'cronjob',
    namespace: 'default',
    ready: 0,
    desired: 0,
    available: 0,
    upToDate: 0,
    age: '14d',
    images: ['backup-tool:v2.0.0'],
    lastSchedule: '24h ago',
    labels: {
      'app': 'backup',
      'schedule': 'daily'
    }
  }
];

// 工作负载类型
const workloadTypes = ['全部', 'deployment', 'statefulset', 'daemonset', 'cronjob'];

// 命名空间数据
const namespaces = ['全部', 'default', 'kube-system', 'dev', 'prod', 'kube-public'];

const Workloads = () => {
  const { theme, toggleTheme } = useThemeContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workloads, setWorkloads] = useState(workloadsData);
  const [namespaceOptions, setNamespaceOptions] = useState(namespaces);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkload, setSelectedWorkload] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState('全部');
  const [selectedWorkloadType, setSelectedWorkloadType] = useState('全部');

  useEffect(() => {
    let active = true;

    const loadWorkloads = async () => {
      setLoading(true);
      try {
        const [deployments, statefulsets, daemonsets, cronjobs, namespaceList] = await Promise.all([
          apiClient.get<any[]>(workloadsAPI.listDeployments),
          apiClient.get<any[]>(workloadsAPI.listStatefulSets),
          apiClient.get<any[]>(workloadsAPI.listDaemonSets),
          apiClient.get<any[]>(workloadsAPI.listCronJobs),
          apiClient.get<Array<{ name: string }>>(namespacesAPI.listNamespaces),
        ]);

        if (!active) {
          return;
        }

        const merged = [
          ...(deployments ?? []).map((item) => ({ ...item, type: 'deployment' })),
          ...(statefulsets ?? []).map((item) => ({ ...item, type: 'statefulset' })),
          ...(daemonsets ?? []).map((item) => ({ ...item, type: 'daemonset' })),
          ...(cronjobs ?? []).map((item) => ({
            ...item,
            type: 'cronjob',
            ready: item.ready ?? 0,
            desired: item.desired ?? 0,
            available: item.available ?? 0,
            upToDate: item.upToDate ?? 0,
          })),
        ];

        if (merged.length > 0) {
          setWorkloads(merged);
        }

        if (Array.isArray(namespaceList) && namespaceList.length > 0) {
          setNamespaceOptions(['全部', ...namespaceList.map((namespace) => namespace.name)]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadWorkloads();

    return () => {
      active = false;
    };
  }, []);

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

  // 过滤和排序工作负载
  const filteredAndSortedWorkloads = workloads
    .filter(workload => {
      const matchesSearch = 
        workload.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        workload.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
        workload.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesNamespace = selectedNamespace === '全部' || workload.namespace === selectedNamespace;
      const matchesType = selectedWorkloadType === '全部' || workload.type === selectedWorkloadType;
      
      return matchesSearch && matchesNamespace && matchesType;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      if (a[sortConfig.key as keyof typeof a] < b[sortConfig.key as keyof typeof b]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key as keyof typeof a] > b[sortConfig.key as keyof typeof b]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

  // 处理排序
  const handleSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // 获取工作负载图标
  const getWorkloadIcon = (type: string) => {
    switch(type) {
      case 'deployment':
        return <Layers className="text-blue-500" size={18} />;
      case 'statefulset':
        return <GitBranch className="text-purple-500" size={18} />;
      case 'daemonset':
        return <Repeat className="text-green-500" size={18} />;
      case 'cronjob':
        return <CircleSlash className="text-orange-500" size={18} />;
      default:
        return <Package className="text-gray-500" size={18} />;
    }
  };

  // 获取工作负载类型标签
  const getWorkloadTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'deployment': 'Deployment',
      'statefulset': 'StatefulSet',
      'daemonset': 'DaemonSet',
      'cronjob': 'CronJob'
    };
    
    return typeMap[type] || type;
  };

  // 渲染导航项
  const renderNavItem = (icon: React.ReactNode, label: string, path: string, active: boolean = false) => (
    <motion.div 
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

  // 工作负载详情视图
  const renderWorkloadDetail = () => {
    if (!selectedWorkload) return null;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme === 'dark' ? 'bg-black/50' : 'bg-black/20'}`}
        onClick={() => setSelectedWorkload(null)}
      >
        <div 
          className={`w-full max-w-4xl rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-xl max-h-[90vh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-bold">{getWorkloadTypeLabel(selectedWorkload.type)}: {selectedWorkload.name}</h3>
            <button 
              className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              onClick={() => setSelectedWorkload(null)}
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <div>
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>基本信息</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>类型</p>
                      <p className="font-medium flex items-center">
                        {getWorkloadIcon(selectedWorkload.type)}
                        <span className="ml-1">{getWorkloadTypeLabel(selectedWorkload.type)}</span>
                      </p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>命名空间</p>
                      <p className="font-medium">{selectedWorkload.namespace}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>创建时间</p>
                      <p className="font-medium">{selectedWorkload.age}</p>
                    </div>
                    {selectedWorkload.type === 'cronjob' && (
                      <div>
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>上次调度</p>
                        <p className="font-medium">{selectedWorkload.lastSchedule}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Pod 状态</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>就绪</p>
                      <p className="font-medium text-green-500">{selectedWorkload.ready}/{selectedWorkload.desired}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>可用</p>
                      <p className="font-medium text-blue-500">{selectedWorkload.available}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>最新</p>
                      <p className="font-medium text-purple-500">{selectedWorkload.upToDate}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>期望</p>
                      <p className="font-medium">{selectedWorkload.desired}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>容器镜像</h4>
                  <div className="space-y-2">
                    {selectedWorkload.images.map((image: string, index: number) => (
                      <div key={index} className={`p-2 rounded border ${theme === 'dark' ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'} text-sm`}>
                        {image}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>操作</h4>
                  <div className="flex flex-wrap gap-2">
                    <button className={`px-3 py-1.5 rounded text-xs font-medium ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}>
                      扩缩容
                    </button>
                    <button className={`px-3 py-1.5 rounded text-xs font-medium ${theme === 'dark' ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white`}>
                      重启
                    </button>
                    <button className={`px-3 py-1.5 rounded text-xs font-medium ${theme === 'dark' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-yellow-500 hover:bg-yellow-600'} text-white`}>
                      编辑
                    </button>
                    <button className={`px-3 py-1.5 rounded text-xs font-medium ${theme === 'dark' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'} text-white`}>
                      删除
                    </button>
                    <button className={`px-3 py-1.5 rounded text-xs font-medium ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                      查看 Pods
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>标签</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selectedWorkload.labels).map(([key, value], index) => (
                  <span 
                    key={index}
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      theme === 'dark' 
                        ? 'bg-gray-700 text-gray-300' 
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            </div>
            
            <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'}`}>
              <h4 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <BarChart size={16} className="mr-1" />
                资源使用概览
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <div className={`h-16 flex items-center justify-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg`}>
                    <div>
                      <p className="text-2xl font-bold">234m</p>
                      <p className="text-xs opacity-70">CPU 使用率</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={`h-16 flex items-center justify-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg`}>
                    <div>
                      <p className="text-2xl font-bold">1.2Gi</p>
                      <p className="text-xs opacity-70">内存使用</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={`h-16 flex items-center justify-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg`}>
                    <div>
                      <p className="text-2xl font-bold">3</p>
                      <p className="text-xs opacity-70">运行中 Pods</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
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
               {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
               {renderNavItem(<Server size={20} />, '节点', '/nodes')}
               {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
               {renderNavItem(<Network size={20} />, '工作负载', '/workloads', true)}
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
          {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
          {renderNavItem(<Server size={20} />, '节点', '/nodes')}
          {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
          {renderNavItem(<Network size={20} />, '工作负载', '/workloads', true)}
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
              <h1 className="text-xl font-bold">工作负载管理</h1>
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

        {/* 工作负载管理内容 */}
        <main className="p-4 md:p-6">
          {loading ? (
            <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm animate-pulse-slow`}>
              <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                  <div className={`h-8 w-1/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  <div className="flex space-x-2">
                    <div className={`h-8 w-20 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                    <div className={`h-8 w-20 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  </div>
                </div>
                <div className={`h-10 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                <div className={`overflow-hidden rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className={`h-14 w-full ${item !== 4 ? 'border-b border-gray-600' : ''}`}></div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={containerVariants}
            >
              {/* 顶部工具栏 */}
              <motion.div 
                variants={itemVariants}
                className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4"
              >
                <div>
                  <h2 className="text-xl font-bold mb-1">工作负载</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    管理和监控 Kubernetes 集群中的所有工作负载
                  </p>
                </div>
                <div className="flex items-center space-x-3 w-full md:w-auto">
                  <div className={`relative flex-1 md:flex-none md:w-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg overflow-hidden`}>
                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                    <input
                      type="text"
                      placeholder="搜索工作负载..."
                      className={`w-full pl-9 pr-3 py-2 text-sm focus:outline-none ${theme === 'dark' ? 'bg-transparent text-white' : 'bg-transparent text-gray-900'}`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <select
                      className={`appearance-none pl-3 pr-8 py-2 rounded-lg text-sm focus:outline-none ${
                        theme === 'dark' 
                          ? 'bg-gray-700 border-gray-600' 
                          : 'bg-gray-100 border-gray-200'
                      } border`}
                      value={selectedWorkloadType}
                      onChange={(e) => setSelectedWorkloadType(e.target.value)}
                    >
                      {workloadTypes.map((type) => (
                        <option key={type} value={type}>
                          {type === '全部' ? '全部类型' : getWorkloadTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                  </div>
                  <div className="relative">
                    <select
                      className={`appearance-none pl-3 pr-8 py-2 rounded-lg text-sm focus:outline-none ${
                        theme === 'dark' 
                          ? 'bg-gray-700 border-gray-600' 
                          : 'bg-gray-100 border-gray-200'
                      } border`}
                      value={selectedNamespace}
                      onChange={(e) => setSelectedNamespace(e.target.value)}
                    >
                      {namespaceOptions.map((namespace) => (
                        <option key={namespace} value={namespace}>
                          {namespace === '全部' ? '全部命名空间' : namespace}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                  </div>
                  <button className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} flex items-center space-x-1 text-sm`}>
                    <Filter size={16} />
                    <span>筛选</span>
                  </button>
                  <button className={`px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white text-sm flex items-center space-x-1`}>
                    <PlusCircle size={16} />
                    <span>创建</span>
                  </button>
                </div>
              </motion.div>

              {/* 工作负载类型统计 */}
              <motion.div 
                variants={itemVariants}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
              >
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Deployments</h3>
                    <Layers className="text-blue-500" size={20} />
                  </div>
                  <p className="text-2xl font-bold mt-2">3</p>
                </div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>StatefulSets</h3>
                    <GitBranch className="text-purple-500" size={20} />
                  </div>
                  <p className="text-2xl font-bold mt-2">1</p>
                </div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>DaemonSets</h3>
                    <Repeat className="text-green-500" size={20} />
                  </div>
                  <p className="text-2xl font-bold mt-2">1</p>
                </div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>CronJobs</h3>
                    <CircleSlash className="text-orange-500" size={20} />
                  </div>
                  <p className="text-2xl font-bold mt-2">1</p>
                </div>
              </motion.div>

              {/* 工作负载列表 */}
              <motion.div 
                variants={itemVariants}
                className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}
              >
                <div className={`overflow-x-auto`}>
                  <table className="w-full">
                    <thead>
                      <tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('name')}>
                            <span>名称</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('type')}>
                            <span>类型</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('namespace')}>
                            <span>命名空间</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('ready')}>
                            <span>就绪状态</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('age')}>
                            <span>创建时间</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span>镜像</span>
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span>操作</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
                      {filteredAndSortedWorkloads.map((workload) => (
                        <tr 
                          key={workload.id}
                          className={`${theme === 'dark' ? 'hover:bg-gray-750' : 'hover:bg-gray-50'} cursor-pointer transition-colors`}
                          onClick={() => setSelectedWorkload(workload)}
                        >
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {getWorkloadIcon(workload.type)}
                              <div className="font-medium ml-2">{workload.name}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              theme === 'dark' 
                                ? 'bg-gray-700' 
                                : 'bg-gray-100'
                            }`}>
                              {getWorkloadTypeLabel(workload.type)}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              theme === 'dark' 
                                ? 'bg-gray-700' 
                                : 'bg-gray-100'
                            }`}>
                              {workload.namespace}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="font-medium">{workload.ready}/{workload.desired}</span>
                              {workload.ready === workload.desired ? (
                                <CheckCircle size={16} className="ml-1 text-green-500" />
                              ) : (
                                <AlertCircle size={16} className="ml-1 text-yellow-500" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span>{workload.age}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="max-w-[150px] truncate">
                              {workload.images[0]}
                              {workload.images.length > 1 && (
                                <span className="text-xs opacity-70"> +{workload.images.length - 1}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                            <div className="flex items-center justify-end space-x-2">
                              <button 
                                className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedWorkload(workload);
                                }}
                              >
                                <Eye size={16} />
                              </button>
                              <button 
                                className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {filteredAndSortedWorkloads.length === 0 && (
                  <div className="p-8 text-center">
                    <Package size={48} className={`mx-auto mb-4 opacity-20 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>没有找到匹配的工作负载</p>
                  </div>
                )}
              </motion.div>
              
              {/* 工作负载详情弹窗 */}
              {renderWorkloadDetail()}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Workloads;
