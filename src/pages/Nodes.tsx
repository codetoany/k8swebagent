import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
  import { 
    Server, BarChart3, Database, Network, Settings, LogOut, 
    Moon, Sun, Menu, X, Search, Bell, ChevronDown, 
    RefreshCw, PlusCircle, MoreVertical, Filter, Download,
    AlertCircle, CheckCircle, ArrowUpDown, Eye, User,

  } from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import { useContext } from 'react';
import { AuthContext } from '@/contexts/authContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import apiClient from '@/lib/apiClient';
import { nodesAPI } from '@/lib/api';
import ClusterSelector from '@/components/ClusterSelector';
import TablePagination from '@/components/TablePagination';

const nodesData: any[] = [];

const MEMORY_UNIT_FACTORS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
};

function formatMemoryToGB(value?: string) {
  if (!value) {
    return '--';
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^([\d.]+)\s*(Ki|Mi|Gi|Ti|K|M|G|T)?$/i);
  if (!match) {
    return trimmed;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return trimmed;
  }

  const unit = match[2] || '';
  const factor = MEMORY_UNIT_FACTORS[unit] || 1;
  const bytes = amount * factor;
  const gigabytes = bytes / (1024 ** 3);

  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(gigabytes >= 100 ? 0 : gigabytes >= 10 ? 1 : 2).replace(/\.0$/, '').replace(/(\.\d)0$/, '$1')} GB`;
  }

  const megabytes = bytes / (1024 ** 2);
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1).replace(/\.0$/, '')} MB`;
}

const Nodes = () => {
  const { theme, toggleTheme } = useThemeContext();
  const {
    enabledClusters,
    loading: clustersLoading,
    selectedCluster,
    setSelectedClusterId,
  } = useClusterContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let active = true;

    const loadNodes = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any[]>(
          nodesAPI.listNodes,
          selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined,
        );
        if (active && Array.isArray(data)) {
          setNodes(data);
          setSelectedNode(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadNodes();

    return () => {
      active = false;
    };
  }, [selectedCluster?.id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortConfig, pageSize, selectedCluster?.id]);

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

  // 过滤和排序节点
  const filteredAndSortedNodes = nodes
    .filter(node => 
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      node.ip.includes(searchTerm) ||
      node.status.toLowerCase().includes(searchTerm.toLowerCase())
    )
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
  const paginatedNodes = filteredAndSortedNodes.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 处理排序
  const handleSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // 格式化使用率条
  const renderUsageBar = (usage: number) => {
    let color = 'bg-green-500';
    if (usage > 80) color = 'bg-red-500';
    else if (usage > 60) color = 'bg-yellow-500';
    
    return (
      <div className={`h-2 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
        <div 
          className={`h-full rounded-full ${color}`}
          style={{ width: `${usage}%` }}
        ></div>
      </div>
    );
  };

  // 渲染状态指示器
  const renderStatusIndicator = (status: string) => {
    if (status === 'online') {
      return (
        <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle size={12} className="mr-1" />
          在线
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle size={12} className="mr-1" />
          离线
        </span>
      );
    }
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

  // 节点详情视图
  const renderNodeDetail = () => {
    if (!selectedNode) return null;

    const cpuData = [
      { name: '已使用', value: parseInt(selectedNode.cpuUsage.toString()) },
      { name: '可用', value: 100 - parseInt(selectedNode.cpuUsage.toString()) }
    ];

    const memoryData = [
      { name: '已使用', value: parseInt(selectedNode.memoryUsage.toString()) },
      { name: '可用', value: 100 - parseInt(selectedNode.memoryUsage.toString()) }
    ];

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme === 'dark' ? 'bg-black/50' : 'bg-black/20'}`}
        onClick={() => setSelectedNode(null)}
      >
        <div 
          className={`w-full max-w-4xl rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-xl max-h-[90vh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-bold">节点详情: {selectedNode.name}</h3>
            <button 
              className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              onClick={() => setSelectedNode(null)}
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
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>状态</p>
                      <p className="font-medium">{renderStatusIndicator(selectedNode.status)}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>IP 地址</p>
                      <p className="font-medium">{selectedNode.ip}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>操作系统</p>
                      <p className="font-medium">{selectedNode.os}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>运行中 Pods</p>
                      <p className="font-medium">{selectedNode.pods}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>版本信息</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>内核版本</p>
                      <p className="font-medium">{selectedNode.kernelVersion}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Kubelet 版本</p>
                      <p className="font-medium">{selectedNode.kubeletVersion}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>资源容量</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>CPU</p>
                      <p className="font-medium">{selectedNode.capacity.cpu}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>内存</p>
                      <p className="font-medium">{formatMemoryToGB(selectedNode.capacity.memory)}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Pod 容量</p>
                      <p className="font-medium">{selectedNode.capacity.pods}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1"><span className="text-sm">CPU 使用率</span>
                      <span className="text-sm font-medium">{selectedNode.cpuUsage}%</span>
                    </div>
                    {renderUsageBar(selectedNode.cpuUsage)}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">内存使用率</span>
                      <span className="text-sm font-medium">{selectedNode.memoryUsage}%</span>
                    </div>
                    {renderUsageBar(selectedNode.memoryUsage)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <h4 className={`text-sm font-medium mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>CPU 使用分布</h4>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cpuData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#4b5563' : '#e5e7eb'} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        formatter={(value) => [`${value}%`, '使用率']}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                          borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {cpuData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? (selectedNode.cpuUsage > 80 ? '#ef4444' : selectedNode.cpuUsage > 60 ? '#f59e0b' : '#10b981') : theme === 'dark' ? '#374151' : '#e5e7eb'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <h4 className={`text-sm font-medium mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>内存使用分布</h4>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={memoryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#4b5563' : '#e5e7eb'} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        formatter={(value) => [`${value}%`, '使用率']}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                          borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {memoryData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? (selectedNode.memoryUsage > 80 ? '#ef4444' : selectedNode.memoryUsage > 60 ? '#f59e0b' : '#10b981') : theme === 'dark' ? '#374151' : '#e5e7eb'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>标签</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selectedNode.labels).map(([key, value], index) => (
                  <span 
                    key={index}
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      theme === 'dark' 
                        ? 'bg-gray-700 text-gray-300' 
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {key}{value ? `: ${value}` : ''}
                  </span>
                ))}
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
               {renderNavItem(<Server size={20} />, '节点', '/nodes', true)}
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
          {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
          {renderNavItem(<Server size={20} />, '节点', '/nodes', true)}
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
              <h1 className="text-xl font-bold">节点管理</h1>
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

        {/* 节点管理内容 */}
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
                  <h2 className="text-xl font-bold mb-1">集群节点</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    管理和监控 {selectedCluster?.name || '当前'} Kubernetes 集群中的所有节点
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <ClusterSelector
                    theme={theme}
                    clusters={enabledClusters}
                    value={selectedCluster?.id || ''}
                    loading={clustersLoading}
                    onChange={setSelectedClusterId}
                    className="w-full md:w-56"
                  />
                  <div className={`relative flex-1 md:flex-none md:w-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg overflow-hidden`}>
                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                    <input
                      type="text"
                      placeholder="搜索节点..."
                      className={`w-full pl-9 pr-3 py-2 text-sm focus:outline-none ${theme === 'dark' ? 'bg-transparent text-white' : 'bg-transparent text-gray-900'}`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} flex items-center space-x-1 text-sm`}>
                    <Filter size={16} />
                    <span>筛选</span>
                  </button>
                  <button className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} flex items-center space-x-1 text-sm`}>
                    <Download size={16} />
                    <span>导出</span>
                  </button>
                  <button className={`px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white text-sm flex items-center space-x-1`}>
                    <PlusCircle size={16} />
                    <span>添加节点</span>
                  </button>
                </div>
              </motion.div>

              {/* 节点统计卡片 */}
              <motion.div 
                variants={itemVariants}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6"
              >
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>总节点数</h3>
                  <p className="text-2xl font-bold">{nodes.length}</p>
                </div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>在线节点</h3>
                  <p className="text-2xl font-bold text-green-500">{nodes.filter(node => node.status === 'online').length}</p>
                </div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>离线节点</h3>
                  <p className="text-2xl font-bold text-red-500">{nodes.filter(node => node.status === 'offline').length}</p>
                </div>
                <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
                  <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mb-1`}>运行中 Pods</h3>
                  <p className="text-2xl font-bold">{nodes.reduce((sum, node) => sum + node.pods, 0)}</p>
                </div>
              </motion.div>

              {/* 节点列表 */}
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
                            <span>节点名称</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('status')}>
                            <span>状态</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('cpuUsage')}>
                            <span>CPU 使用率</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('memoryUsage')}>
                            <span>内存使用率</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center cursor-pointer" onClick={() => handleSort('pods')}>
                            <span>运行中 Pods</span>
                            <ArrowUpDown size={14} className="ml-1" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span>IP 地址</span>
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span>操作</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
                      {paginatedNodes.map((node) => (
                        <tr 
                          key={node.id}
                          className={`${theme === 'dark' ? 'hover:bg-gray-750' : 'hover:bg-gray-50'} cursor-pointer transition-colors`}
                          onClick={() => setSelectedNode(node)}
                        >
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Server size={16} className={`mr-2 ${node.status === 'online' ? 'text-green-500' : 'text-red-500'}`} />
                              <div className="font-medium">{node.name}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderStatusIndicator(node.status)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span>{node.cpuUsage}%</span>
                                <span className="text-xs opacity-70">{node.capacity.cpu}</span>
                              </div>
                              {renderUsageBar(node.cpuUsage)}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span>{node.memoryUsage}%</span>
                                <span className="text-xs opacity-70">{formatMemoryToGB(node.capacity.memory)}</span>
                              </div>
                              {renderUsageBar(node.memoryUsage)}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span>{node.pods}/{node.capacity.pods}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span>{node.ip}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                            <div className="flex items-center justify-end space-x-2">
                              <button 
                                className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNode(node);
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
                
                {filteredAndSortedNodes.length === 0 && (
                  <div className="p-8 text-center">
                    <Server size={48} className={`mx-auto mb-4 opacity-20 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>没有找到匹配的节点</p>
                  </div>
                )}

                {filteredAndSortedNodes.length > 0 && (
                  <TablePagination
                    theme={theme}
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalItems={filteredAndSortedNodes.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                  />
                )}
              </motion.div>
              
              {/* 节点详情弹窗 */}
              {renderNodeDetail()}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Nodes;
