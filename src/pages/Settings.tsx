  import { useState, useEffect } from 'react';
  import { motion } from 'framer-motion';
  import { 
    Server, BarChart3, Database, Network, Settings, LogOut, 
    Moon, Sun, Menu, X, Search, Bell, ChevronDown, 
    RefreshCw, PlusCircle, MoreVertical, Filter, Download,
    AlertCircle, CheckCircle, ArrowUpDown, Eye, 
    User, Shield, BellRing, Info, HelpCircle,
    ExternalLink, Save, X as XIcon,
    BarChart, Brain, Edit, Trash, Check
  } from 'lucide-react';
  import { useThemeContext } from '@/contexts/themeContext';
  import { useClusterContext } from '@/contexts/clusterContext';
  import { useContext } from 'react';
  import { AuthContext } from '@/contexts/authContext';
  import { useNavigate } from 'react-router-dom';
  import { toast } from 'sonner';
  import apiClient from '@/lib/apiClient';
  import { clustersAPI, replacePathParams, settingsAPI } from '@/lib/api';
  import { type ClusterConfig, type ClusterMode, createEmptyClusterConfig } from '@/lib/clusters';

  // 定义设置选项类型
  type ThemeOption = 'light' | 'dark' | 'system';
  type NotificationOption = 'all' | 'critical' | 'none';
  type LanguageOption = 'zh-CN' | 'en-US';
  
  // 定义AI模型类型
  interface AIModel {
    id: string;
    name: string;
    apiBaseUrl: string;
    apiKey: string;
    modelType: string;
    isDefault: boolean;
  }

  type ClusterEditorMode = 'create' | 'edit';

  const SettingsPage = () => {
    const { theme, toggleTheme } = useThemeContext();
    const { clusters, refreshClusters } = useClusterContext();
    const { logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('general');
    
    // 设置表单状态
    const [themeOption, setThemeOption] = useState<ThemeOption>('system');
    const [notificationOption, setNotificationOption] = useState<NotificationOption>('all');
    const [languageOption, setLanguageOption] = useState<LanguageOption>('zh-CN');
    const [autoRefresh, setAutoRefresh] = useState<number>(30);
    const [showResourceUsage, setShowResourceUsage] = useState(true);
    const [showEvents, setShowEvents] = useState(true);
    const [clusterConfig, setClusterConfig] = useState<ClusterConfig>(createEmptyClusterConfig);
    const [savedClusterConfig, setSavedClusterConfig] = useState<ClusterConfig>(createEmptyClusterConfig);
    const [selectedClusterConfigId, setSelectedClusterConfigId] = useState('');
    const [clusterSaving, setClusterSaving] = useState(false);
    const [clusterTesting, setClusterTesting] = useState(false);
    const [isClusterEditorOpen, setIsClusterEditorOpen] = useState(false);
    const [clusterEditorMode, setClusterEditorMode] = useState<ClusterEditorMode>('create');
    const [clusterActionLoadingId, setClusterActionLoadingId] = useState('');
    
    // AI模型相关状态
    const [aiModels, setAiModels] = useState<AIModel[]>([]);
    const [isAddingModel, setIsAddingModel] = useState(false);
    const [editingModel, setEditingModel] = useState<AIModel | null>(null);
    const [newModel, setNewModel] = useState<AIModel>({
      id: '',
      name: '',
      apiBaseUrl: '',
      apiKey: '',
      modelType: 'openai',
      isDefault: false
    });
    const normalizeClusterConfig = (cluster?: Partial<ClusterConfig> | null): ClusterConfig => {
      return {
        ...createEmptyClusterConfig(),
        ...cluster,
        mode: (cluster?.mode as ClusterMode) || 'token',
        token: '',
        caData: '',
        kubeconfig: '',
      };
    };

    const applyClusterConfig = (cluster?: Partial<ClusterConfig> | null, syncSaved: boolean = true) => {
      const nextConfig = normalizeClusterConfig(cluster);
      setClusterConfig(nextConfig);
      if (syncSaved) {
        setSavedClusterConfig(nextConfig);
        setSelectedClusterConfigId(nextConfig.id || '');
      }
      return nextConfig;
    };

    const formatClusterDate = (value?: string) => {
      if (!value) {
        return '未记录';
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }

      return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(parsed);
    };

    const getClusterModeLabel = (mode: ClusterMode) => {
      switch (mode) {
        case 'token':
          return '令牌';
        case 'kubeconfig':
          return 'KubeConfig';
        case 'in-cluster':
          return '集群内服务账户';
        default:
          return mode;
      }
    };

    const getClusterStatusMeta = (status?: string) => {
      switch (status) {
        case 'connected':
          return {
            label: '连接成功',
            badgeClass: theme === 'dark'
              ? 'border border-green-500/30 bg-green-500/10 text-green-300'
              : 'border border-green-200 bg-green-50 text-green-700',
            iconClass: 'text-green-400',
            cardClass: theme === 'dark'
              ? 'border-green-500/20 shadow-[0_0_0_1px_rgba(34,197,94,0.15)]'
              : 'border-green-200 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]',
          };
        case 'error':
          return {
            label: '连接异常',
            badgeClass: theme === 'dark'
              ? 'border border-red-500/30 bg-red-500/10 text-red-300'
              : 'border border-red-200 bg-red-50 text-red-700',
            iconClass: 'text-red-400',
            cardClass: theme === 'dark'
              ? 'border-red-500/20 shadow-[0_0_0_1px_rgba(248,113,113,0.12)]'
              : 'border-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.1)]',
          };
        case 'not_configured':
          return {
            label: '未配置',
            badgeClass: theme === 'dark'
              ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border border-amber-200 bg-amber-50 text-amber-700',
            iconClass: 'text-amber-400',
            cardClass: '',
          };
        default:
          return {
            label: '待验证',
            badgeClass: theme === 'dark'
              ? 'border border-gray-600 bg-gray-800 text-gray-300'
              : 'border border-gray-200 bg-gray-50 text-gray-600',
            iconClass: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
            cardClass: '',
          };
      }
    };

    const openClusterEditor = (mode: ClusterEditorMode, cluster?: Partial<ClusterConfig> | null) => {
      setClusterEditorMode(mode);
      applyClusterConfig(cluster, false);
      setIsClusterEditorOpen(true);
    };

    const closeClusterEditor = () => {
      setIsClusterEditorOpen(false);
    };

    const selectClusterCard = (clusterId: string) => {
      const selectedCluster = clusters.find((cluster) => cluster.id === clusterId) || null;
      applyClusterConfig(selectedCluster);
    };

    const loadClusterConfig = async (preferredClusterId?: string) => {
      const availableClusters = await refreshClusters();
      const nextCluster = preferredClusterId
        ? availableClusters.find((cluster) => cluster.id === preferredClusterId) || null
        : availableClusters.find((cluster) => cluster.isDefault) || availableClusters[0] || null;

      applyClusterConfig(nextCluster);
      return nextCluster;
    };
    
    // 接入只读设置接口
    useEffect(() => {
      let active = true;

      const loadSettings = async () => {
        setLoading(true);
        try {
          const [settings, models] = await Promise.all([
            apiClient.get<any>(settingsAPI.getSettings),
            apiClient.get<AIModel[]>(settingsAPI.getAIModels),
            loadClusterConfig(),
          ]);

          if (!active) {
            return;
          }

          if (settings?.theme) {
            setThemeOption(settings.theme as ThemeOption);
          }
          if (settings?.language) {
            setLanguageOption(settings.language as LanguageOption);
          }
          if (settings?.autoRefreshInterval !== undefined) {
            setAutoRefresh(settings.autoRefreshInterval);
          }
          if (settings?.showResourceUsage !== undefined) {
            setShowResourceUsage(settings.showResourceUsage);
          }
          if (settings?.showEvents !== undefined) {
            setShowEvents(settings.showEvents);
          }
          if (settings?.notifications?.level) {
            setNotificationOption(settings.notifications.level as NotificationOption);
          }
          if (Array.isArray(models)) {
            setAiModels(models.map((model) => ({ ...model, apiKey: model.apiKey ?? '' })));
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      void loadSettings();

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

    // 处理主题变更
    const handleThemeChange = (option: ThemeOption) => {
      setThemeOption(option);
      localStorage.setItem('theme', option);
      
      if (option === 'system') {
        const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(isDarkMode ? 'dark' : 'light');
      } else {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(option);
      }
    };

    // 保存设置
    const handleSaveSettings = () => {
      // 模拟保存设置到本地存储
      const settings = {
        themeOption,
        notificationOption,
        languageOption,
        autoRefresh,
        showResourceUsage,
        showEvents
      };
      
      localStorage.setItem('k8s-agent-settings', JSON.stringify(settings));
      
      // 显示保存成功提示
      toast('设置已保存！');
    };

    // 渲染导航项
    const updateClusterConfig = (patch: Partial<ClusterConfig>) => {
      setClusterConfig((current) => ({
        ...current,
        ...patch,
      }));
    };

    const handleClusterConfigSelection = (clusterId: string) => {
      selectClusterCard(clusterId);
    };

    const handleCreateClusterConfig = () => {
      openClusterEditor('create', {
        ...createEmptyClusterConfig(),
        isDefault: clusters.length === 0,
      });
    };

    const handleEditClusterConfig = (cluster: ClusterConfig) => {
      setSelectedClusterConfigId(cluster.id);
      setSavedClusterConfig(normalizeClusterConfig(cluster));
      openClusterEditor('edit', cluster);
    };

    const buildClusterPayload = () => {
      const name = clusterConfig.name.trim();
      if (!name) {
        toast.error('请填写集群名称');
        return null;
      }

      const payload: Record<string, unknown> = {
        name,
        mode: clusterConfig.mode,
        isDefault: clusterConfig.isDefault,
        isEnabled: clusterConfig.isEnabled,
        insecureSkipTLSVerify: clusterConfig.insecureSkipTLSVerify,
      };

      if (clusterConfig.mode === 'token') {
        const apiServer = clusterConfig.apiServer.trim();
        if (!apiServer) {
          toast.error('请填写 API 服务器地址');
          return null;
        }

        payload.apiServer = apiServer;
        if (!clusterConfig.id && !clusterConfig.token.trim()) {
          toast.error('首次保存 token 模式时必须填写访问令牌');
          return null;
        }
        if (clusterConfig.token.trim()) {
          payload.token = clusterConfig.token.trim();
        }
        if (clusterConfig.caData.trim()) {
          payload.caData = clusterConfig.caData.trim();
        }
      }

      if (clusterConfig.mode === 'kubeconfig') {
        if (!clusterConfig.kubeconfig.trim() && !clusterConfig.kubeconfigPath.trim()) {
          toast.error('请填写 kubeconfig 内容或 kubeconfig 路径');
          return null;
        }
        if (clusterConfig.kubeconfig.trim()) {
          payload.kubeconfig = clusterConfig.kubeconfig.trim();
        }
        if (clusterConfig.kubeconfigPath.trim()) {
          payload.kubeconfigPath = clusterConfig.kubeconfigPath.trim();
        }
      }

      return payload;
    };

    const persistClusterConfig = async (showToast = true) => {
      const payload = buildClusterPayload();
      if (!payload) {
        return null;
      }

      setClusterSaving(true);
      try {
        const savedCluster = clusterConfig.id
          ? await apiClient.put<ClusterConfig>(
              replacePathParams(clustersAPI.updateCluster, { id: clusterConfig.id }),
              payload,
            )
          : await apiClient.post<ClusterConfig>(clustersAPI.createCluster, payload);

        await loadClusterConfig(savedCluster.id);
        if (showToast) {
          toast.success('集群配置已保存');
        }
        return savedCluster;
      } finally {
        setClusterSaving(false);
      }
    };

    const handleSaveClusterConfig = async () => {
      const savedCluster = await persistClusterConfig();
      if (savedCluster?.id) {
        closeClusterEditor();
      }
    };

    const handleTestClusterConnection = async () => {
      setClusterTesting(true);
      try {
        const savedCluster = await persistClusterConfig(false);
        if (!savedCluster?.id) {
          return;
        }

        const result = await apiClient.post<{
          status: string;
          message?: string;
          serverVersion?: string;
        }>(
          replacePathParams(clustersAPI.testCluster, { id: savedCluster.id }),
          {},
        );

        await loadClusterConfig(savedCluster.id);
        if (result.status === 'connected') {
          toast.success(`连接成功${result.serverVersion ? `，集群版本 ${result.serverVersion}` : ''}`);
          return;
        }

        toast.error(result.message || '连接测试失败');
      } finally {
        setClusterTesting(false);
      }
    };

    const handleDeleteClusterConfig = async (cluster: ClusterConfig) => {
      const confirmed = window.confirm(`确认删除集群“${cluster.name}”吗？删除后可重新创建。`);
      if (!confirmed) {
        return;
      }

      setClusterActionLoadingId(cluster.id);
      try {
        await apiClient.delete<void>(
          replacePathParams(clustersAPI.deleteCluster, { id: cluster.id }),
        );
        await loadClusterConfig(selectedClusterConfigId === cluster.id ? undefined : selectedClusterConfigId);
        toast.success('集群已删除');
      } finally {
        setClusterActionLoadingId('');
      }
    };

    const handleSetDefaultClusterConfig = async (cluster: ClusterConfig) => {
      setClusterActionLoadingId(cluster.id);
      try {
        await apiClient.put<ClusterConfig>(
          replacePathParams(clustersAPI.updateCluster, { id: cluster.id }),
          {
            isDefault: true,
            isEnabled: true,
          },
        );
        await loadClusterConfig(cluster.id);
        toast.success('已设为默认集群');
      } finally {
        setClusterActionLoadingId('');
      }
    };

    const handleCancelSettings = () => {
      if (activeTab === 'advanced') {
        setSelectedClusterConfigId(savedClusterConfig.id);
        updateClusterConfig({
          ...savedClusterConfig,
          token: '',
          caData: '',
          kubeconfig: '',
        });
      }
    };

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
    
    // 保存AI模型
    const saveAiModels = (models: AIModel[]) => {
      setAiModels(models);
      localStorage.setItem('aiModels', JSON.stringify(models));
    };
    
    // 添加AI模型
    const handleAddModel = () => {
      if (!newModel.name || !newModel.apiBaseUrl) {
        toast('请填写模型名称和API基础地址');
        return;
      }
      
      const updatedModels = [...aiModels];
      
      // 如果设置为默认，取消其他模型的默认状态
      if (newModel.isDefault) {
        updatedModels.forEach(model => model.isDefault = false);
      }
      
      const modelToAdd = {
        ...newModel,
        id: newModel.id || `model-${Date.now()}`,
      };
      
      updatedModels.push(modelToAdd);
      saveAiModels(updatedModels);
      
      // 重置表单
      setNewModel({
        id: '',
        name: '',
        apiBaseUrl: '',
        apiKey: '',
        modelType: 'openai',
        isDefault: false
      });
      setIsAddingModel(false);
      toast('AI模型已添加');
    };
    
    // 编辑AI模型
    const handleEditModel = (model: AIModel) => {
      setEditingModel({...model});
    };
    
    // 保存编辑的模型
    const handleSaveEdit = () => {
      if (!editingModel || !editingModel.name || !editingModel.apiBaseUrl) {
        toast('请填写模型名称和API基础地址');
        return;
      }
      
      const updatedModels = aiModels.map(model => {
        if (model.id === editingModel.id) {
          return editingModel;
        }
        // 如果编辑的模型设置为默认，取消其他模型的默认状态
        if (editingModel.isDefault) {
          return {...model, isDefault: false};
        }
        return model;
      });
      
      saveAiModels(updatedModels);
      setEditingModel(null);
      toast('AI模型已更新');
    };
    
    // 删除AI模型
    const handleDeleteModel = (id: string) => {
      if (aiModels.length <= 1) {
        toast('至少需要保留一个AI模型');
        return;
      }
      
      const updatedModels = aiModels.filter(model => model.id !== id);
      saveAiModels(updatedModels);
      toast('AI模型已删除');
    };
    
    // 设置默认模型
    const handleSetDefault = (id: string) => {
      const updatedModels = aiModels.map(model => ({
        ...model,
        isDefault: model.id === id
      }));
      saveAiModels(updatedModels);
      toast('默认模型已设置');
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
                 {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
                 {renderNavItem(<Settings size={20} />, '设置', '/settings', true)}
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
            {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
            {renderNavItem(<Settings size={20} />, '设置', '/settings', true)}
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
                <h1 className="text-xl font-bold">应用设置</h1>
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

          {/* 设置内容 */}
          <main className="p-4 md:p-6">
            {loading ? (
              <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm animate-pulse-slow`}>
                <div className="flex flex-col space-y-4">
                  <div className={`h-8 w-1/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  <div className="flex space-x-4">
                    {[1, 2, 3, 4, 5].map((item) => (
                      <div key={item} className={`h-10 w-24 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="space-y-2">
                          <div className={`h-4 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                          <div className={`h-12 w-full rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="space-y-2">
                          <div className={`h-4 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                          <div className={`h-12 w-full rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <motion.div 
                initial="hidden"
                animate="visible"
                variants={containerVariants}
              >
                {/* 页面标题 */}
                <motion.div 
                  variants={itemVariants}
                  className="mb-6"
                >
                  <h2 className="text-xl font-bold mb-1">设置</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    自定义 K8s Agent 的外观和行为
                  </p>
                </motion.div>

                {/* 设置选项卡 */}
                <motion.div 
                  variants={itemVariants}
                  className="mb-6 border-b border-gray-700"
                >
                  <div className="flex space-x-1 overflow-x-auto pb-2">
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'general' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('general')}
                    >
                      通用
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'notifications' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('notifications')}
                    >
                      通知
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'appearance' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('appearance')}
                    >
                      外观
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'advanced' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('advanced')}
                    >
                      高级
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'ai-models' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('ai-models')}
                    >
                      <Brain size={16} className="inline mr-1" />
                      AI 模型
                    </button>
                  </div>
                </motion.div>

                {/* 设置表单 */}
                <motion.div 
                  variants={itemVariants}
                  className={`rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm p-5`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 左侧设置 */}
                    <div className="space-y-6">
                      {activeTab === 'general' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              主题
                            </label>
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="theme-light"
                                  name="theme"
                                  value="light"
                                  checked={themeOption === 'light'}
                                  onChange={() => handleThemeChange('light')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="theme-light" className="ml-2 text-sm">
                                  亮色模式
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="theme-dark"
                                  name="theme"
                                  value="dark"
                                  checked={themeOption === 'dark'}
                                  onChange={() => handleThemeChange('dark')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="theme-dark" className="ml-2 text-sm">
                                  暗色模式
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="theme-system"
                                  name="theme"
                                  value="system"
                                  checked={themeOption === 'system'}
                                  onChange={() => handleThemeChange('system')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="theme-system" className="ml-2 text-sm">
                                  跟随系统
                                </label>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              语言
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              value={languageOption}
                              onChange={(e) => setLanguageOption(e.target.value as LanguageOption)}
                            >
                              <option value="zh-CN">简体中文</option>
                              <option value="en-US">English (US)</option>
                            </select>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              自动刷新间隔 (秒)
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              value={autoRefresh}
                              onChange={(e) => setAutoRefresh(parseInt(e.target.value))}
                            >
                              <option value={10}>10</option>
                              <option value={30}>30</option>
                              <option value={60}>60</option>
                              <option value={120}>120</option>
                              <option value={300}>300</option>
                              <option value={0}>禁用</option>
                            </select>
                          </div>

                        </>
                      )}

                      {activeTab === 'notifications' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              通知级别
                            </label>
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="notifications-all"
                                  name="notifications"
                                  value="all"
                                  checked={notificationOption === 'all'}
                                  onChange={() => setNotificationOption('all')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                /><label htmlFor="notifications-all" className="ml-2 text-sm">
                                  所有通知
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="notifications-critical"
                                  name="notifications"
                                  value="critical"
                                  checked={notificationOption === 'critical'}
                                  onChange={() => setNotificationOption('critical')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="notifications-critical" className="ml-2 text-sm">
                                  仅重要通知
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="notifications-none"
                                  name="notifications"
                                  value="none"
                                  checked={notificationOption === 'none'}
                                  onChange={() => setNotificationOption('none')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="notifications-none" className="ml-2 text-sm">
                                  禁用通知
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              通知类型
                            </h3>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <BellRing size={16} className="mr-2" />
                                <span className="text-sm">节点状态变化</span>
                              </div><label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} className="sr-only peer" />
                                <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                              </label>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <AlertCircle size={16} className="mr-2" />
                                <span className="text-sm">Pod 失败通知</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={true} readOnly className="sr-only peer" />
                                <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                              </label>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <RefreshCw size={16} className="mr-2" />
                                <span className="text-sm">工作负载更新</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={true} readOnly className="sr-only peer" />
                                <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                              </label>
                            </div>
                          </div>
                        </>
                      )}

                      {activeTab === 'appearance' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              仪表盘显示选项
                            </label>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Server size={16} className="mr-2" />
                                  <span className="text-sm">显示资源使用图表</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={showResourceUsage} onChange={(e) => setShowResourceUsage(e.target.checked)} className="sr-only peer" />
                                  <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                </label>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Bell size={16} className="mr-2" />
                                  <span className="text-sm">显示最近事件</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} className="sr-only peer" />
                                  <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                </label>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <BarChart size={16} className="mr-2" />
                                  <span className="text-sm">显示命名空间分布</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={true} readOnly className="sr-only peer" />
                                  <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                </label>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              导航栏位置
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              defaultValue="left"
                            >
                              <option value="left">左侧</option>
                              <option value="top">顶部</option>
                            </select>
                          </div>
                        </>
                      )}

                      {activeTab === 'advanced' && (
                        <>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                集群接入
                              </h3>
                              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                保存后会生成集群卡片。点击卡片查看当前状态，点击编辑再打开配置面板，体验会比一直停留在大表单里更顺手。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleCreateClusterConfig}
                              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                                theme === 'dark'
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                              }`}
                            >
                              <PlusCircle size={16} className="mr-2" />
                              新建集群
                            </button>
                          </div>

                          {clusters.length === 0 ? (
                            <div className={`rounded-xl border border-dashed p-8 text-center ${
                              theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-50'
                            }`}>
                              <Server size={28} className={`mx-auto mb-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                              <p className={`text-base font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                                还没有保存任何集群配置
                              </p>
                              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                先创建一条接入配置，保存后这里就会生成可查看、可编辑、可删除的集群卡片。
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              {clusters.map((cluster) => {
                                const statusMeta = getClusterStatusMeta(cluster.lastConnectionStatus);
                                const isSelected = selectedClusterConfigId === cluster.id;
                                const isBusy = clusterActionLoadingId === cluster.id;

                                return (
                                  <motion.div
                                    key={cluster.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                    onClick={() => handleClusterConfigSelection(cluster.id)}
                                    className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                                      theme === 'dark' ? 'bg-gray-800/70' : 'bg-white'
                                    } ${
                                      isSelected
                                        ? theme === 'dark'
                                          ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]'
                                          : 'border-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                                        : theme === 'dark'
                                          ? 'border-gray-700 hover:border-gray-600'
                                          : 'border-gray-200 hover:border-gray-300'
                                    } ${statusMeta.cardClass}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h4 className={`truncate text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                            {cluster.name}
                                          </h4>
                                          {cluster.isDefault && (
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                              theme === 'dark'
                                                ? 'bg-blue-500/15 text-blue-300'
                                                : 'bg-blue-50 text-blue-700'
                                            }`}>
                                              默认
                                            </span>
                                          )}
                                          {!cluster.isEnabled && (
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                              theme === 'dark'
                                                ? 'bg-gray-700 text-gray-300'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}>
                                              已停用
                                            </span>
                                          )}
                                        </div>
                                        <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          {getClusterModeLabel(cluster.mode)}
                                        </p>
                                      </div>
                                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badgeClass}`}>
                                        {cluster.lastConnectionStatus === 'connected' ? (
                                          <CheckCircle size={12} className="mr-1.5" />
                                        ) : cluster.lastConnectionStatus === 'error' ? (
                                          <AlertCircle size={12} className="mr-1.5" />
                                        ) : (
                                          <RefreshCw size={12} className="mr-1.5" />
                                        )}
                                        {statusMeta.label}
                                      </span>
                                    </div>

                                    <div className="mt-4 space-y-2 text-sm">
                                      <div>
                                        <p className={theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}>API Server</p>
                                        <p className={`break-all ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                                          {cluster.apiServer || '集群内模式'}
                                        </p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                          <p className={theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}>最近连接</p>
                                          <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                                            {formatClusterDate(cluster.lastConnectedAt)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className={theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}>最近更新</p>
                                          <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                                            {formatClusterDate(cluster.updatedAt)}
                                          </p>
                                        </div>
                                      </div>
                                      {cluster.lastConnectionStatus === 'error' && cluster.lastConnectionError && (
                                        <div className={`rounded-lg px-3 py-2 text-xs ${
                                          theme === 'dark' ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700'
                                        }`}>
                                          {cluster.lastConnectionError}
                                        </div>
                                      )}
                                    </div>

                                    <div className={`mt-4 flex flex-wrap items-center gap-2 border-t pt-4 ${
                                      theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                                    }`}>
                                      {!cluster.isDefault && (
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void handleSetDefaultClusterConfig(cluster);
                                          }}
                                          disabled={isBusy}
                                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium ${
                                            theme === 'dark'
                                              ? 'bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-60'
                                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-60'
                                          }`}
                                        >
                                          {isBusy ? (
                                            <RefreshCw size={13} className="mr-1.5 animate-spin" />
                                          ) : (
                                            <Check size={13} className="mr-1.5" />
                                          )}
                                          设为默认
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleEditClusterConfig(cluster);
                                        }}
                                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium ${
                                          theme === 'dark'
                                            ? 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                        }`}
                                      >
                                        <Edit size={13} className="mr-1.5" />
                                        编辑
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleDeleteClusterConfig(cluster);
                                        }}
                                        disabled={isBusy}
                                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium ${
                                          theme === 'dark'
                                            ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-60'
                                            : 'bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60'
                                        }`}
                                      >
                                        {isBusy ? (
                                          <RefreshCw size={13} className="mr-1.5 animate-spin" />
                                        ) : (
                                          <Trash size={13} className="mr-1.5" />
                                        )}
                                        删除
                                      </button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          )}

                          <div className={`rounded-lg border p-3 text-sm ${theme === 'dark' ? 'border-gray-700 bg-gray-800/60 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                            资源页已经支持按集群切换显示；这里保存的是接入配置。建议先保存，再通过卡片编辑补充或更新凭证，然后在弹出的面板中测试连接。
                          </div>
                        </>
                      )}

                      {/* AI模型配置 */}
                      {activeTab === 'ai-models' && (
                        <>
                          <div className="flex justify-between items-center mb-4">
                            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              AI 大模型配置
                            </h3>
                            <button 
                              onClick={() => setIsAddingModel(true)}
                              className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                            >
                              <PlusCircle size={14} className="mr-1" />
                              添加模型
                            </button>
                          </div>
                          
                          <div className="space-y-4">
                            {aiModels.map(model => (
                              <motion.div 
                                key={model.id}
                                className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} transition-all duration-200 ${editingModel?.id === model.id ? (theme === 'dark' ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200') : ''}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                              >
                                {editingModel?.id === model.id ? (
                                  // 编辑模式
                                  <div className="space-y-3">
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        模型名称
                                      </label>
                                      <input
                                        type="text"
                                        value={editingModel.name}
                                        onChange={(e) => setEditingModel({...editingModel, name: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        API 基础地址
                                      </label>
                                      <input
                                        type="text"
                                        value={editingModel.apiBaseUrl}
                                        onChange={(e) => setEditingModel({...editingModel, apiBaseUrl: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        API 密钥
                                      </label>
                                      <input
                                        type="password"
                                        value={editingModel.apiKey}
                                        onChange={(e) => setEditingModel({...editingModel, apiKey: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        模型类型
                                      </label>
                                      <select
                                        value={editingModel.modelType}
                                        onChange={(e) => setEditingModel({...editingModel, modelType: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      >
                                        <option value="openai">OpenAI</option>
                                        <option value="anthropic">Anthropic</option>
                                        <option value="other">其他</option>
                                      </select>
                                    </div>
                                    <div className="flex items-center">
                                      <input
                                        type="checkbox"
                                        id={`default-${model.id}`}
                                        checked={editingModel.isDefault}
                                        onChange={(e) => setEditingModel({...editingModel, isDefault: e.target.checked})}
                                        className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                      />
                                      <label htmlFor={`default-${model.id}`} className="ml-2 text-sm">
                                        设置为默认模型
                                      </label>
                                    </div>
                                    <div className="flex justify-end space-x-2 pt-2 border-t border-gray-700">
                                      <button 
                                        onClick={() => setEditingModel(null)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                                      >
                                        取消
                                      </button>
                                      <button 
                                        onClick={handleSaveEdit}
                                        className={`px-3 py-1.5 text-xs font-medium rounded ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                                      >
                                        保存
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // 查看模式
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h4 className="font-medium flex items-center">
                                          {model.name}
                                          {model.isDefault && (
                                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                              默认
                                            </span>
                                          )}
                                        </h4>
                                        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          API 地址: {model.apiBaseUrl}
                                        </p>
                                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          类型: {model.modelType === 'openai' ? 'OpenAI' : model.modelType === 'anthropic' ? 'Anthropic' : '其他'}
                                        </p>
                                      </div>
                                      <div className="flex space-x-1">
                                        {!model.isDefault && (
                                          <button 
                                            onClick={() => handleSetDefault(model.id)}
                                            className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                            aria-label="设为默认"
                                          >
                                            <Check size={14} />
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => handleEditModel(model)}
                                          className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                          aria-label="编辑"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        {aiModels.length > 1 && (
                                          <button 
                                            onClick={() => handleDeleteModel(model.id)}
                                            className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-200 text-red-500'}`}
                                            aria-label="删除"
                                          >
                                            <Trash size={14} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 右侧信息面板 */}
                    <div className={`space-y-6 ${theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50'} p-4 rounded-xl`}>
                      {activeTab !== 'ai-models' && (
                        <>
                          {activeTab === 'advanced' && (
                            <div>
                              <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                <Server size={16} className="mr-1" />
                                集群连接
                              </h3>
                              <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-700/60' : 'border-gray-200 bg-white'} text-sm space-y-2`}>
                                <div>
                                  <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>当前选中集群</p>
                                  <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{savedClusterConfig.name || '未配置'}</p>
                                </div>
                                <div>
                                  <p className={`font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>连接状态</p>
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getClusterStatusMeta(savedClusterConfig.id ? savedClusterConfig.lastConnectionStatus : 'not_configured').badgeClass}`}>
                                    {(savedClusterConfig.id ? savedClusterConfig.lastConnectionStatus : 'not_configured') === 'connected' ? (
                                      <CheckCircle size={12} className="mr-1.5" />
                                    ) : (savedClusterConfig.id ? savedClusterConfig.lastConnectionStatus : 'not_configured') === 'error' ? (
                                      <AlertCircle size={12} className="mr-1.5" />
                                    ) : (
                                      <RefreshCw size={12} className="mr-1.5" />
                                    )}
                                    {getClusterStatusMeta(savedClusterConfig.id ? savedClusterConfig.lastConnectionStatus : 'not_configured').label}
                                  </span>
                                </div>
                                <div>
                                  <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>API Server</p>
                                  <p className={`break-all ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{savedClusterConfig.apiServer || '集群内模式'}</p>
                                </div>
                                <div>
                                  <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>认证方式</p>
                                  <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                                    {savedClusterConfig.id ? getClusterModeLabel(savedClusterConfig.mode) : '未设置'}
                                  </p>
                                </div>
                                {savedClusterConfig.lastConnectedAt && (
                                  <div>
                                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>最近连接时间</p>
                                    <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{formatClusterDate(savedClusterConfig.lastConnectedAt)}</p>
                                  </div>
                                )}
                                {savedClusterConfig.id && savedClusterConfig.lastConnectionStatus === 'connected' && (
                                  <div>
                                    <p className="font-medium text-green-500">最近结果</p>
                                    <p className="break-all text-green-400">连接成功，可以正常读取集群数据</p>
                                  </div>
                                )}
                                {savedClusterConfig.id && savedClusterConfig.lastConnectionStatus === 'error' && savedClusterConfig.lastConnectionError && (
                                  <div>
                                    <p className="font-medium text-red-500">最近错误</p>
                                    <p className="text-red-400 break-all">{savedClusterConfig.lastConnectionError}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div>
                            <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              <Info size={16} className="mr-1" />
                              关于 K8s Agent
                            </h3>
                            <div className="space-y-3 text-sm">
                              <div>
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>版本</p>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>v1.0.0</p>
                              </div>
                              <div>
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>构建时间</p>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>2026-03-13</p>
                              </div>
                              <div>
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Kubernetes 支持</p>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>v1.24+</p>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              <HelpCircle size={16} className="mr-1" />
                              获取帮助
                            </h3>
                            <div className="space-y-2">
                              <a 
                                href="#" 
                                className={`block py-2 px-3 rounded-lg text-sm flex items-center justify-between ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white text-gray-700'}`}
                                onClick={(e) => e.preventDefault()}
                              >
                                <span>文档中心</span>
                                <ExternalLink size={14} />
                              </a>
                              <a 
                                href="#" 
                                className={`block py-2 px-3 rounded-lg text-sm flex items-center justify-between ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white text-gray-700'}`}
                                onClick={(e) => e.preventDefault()}
                              >
                                <span>常见问题</span>
                                <ExternalLink size={14} />
                              </a>
                              <a 
                                href="#" 
                                className={`block py-2 px-3 rounded-lg text-sm flex items-center justify-between ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white text-gray-700'}`}
                                onClick={(e) => e.preventDefault()}
                              >
                                <span>联系支持</span>
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {activeTab === 'ai-models' && (
                        <div>
                          <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            <Info size={16} className="mr-1" />
                            AI 模型配置说明
                          </h3>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-blue-50'} text-sm space-y-2`}>
                            <p>您可以配置多个AI模型用于Kubernetes集群分析。默认模型将用于AI诊断功能。</p>
                            <p>对于OpenAI模型，API基础地址通常为：<code className="px-1 py-0.5 rounded bg-gray-700 text-green-400 text-xs">https://api.openai.com/v1</code></p>
                            <p>对于Anthropic模型，API基础地址通常为：<code className="px-1 py-0.5 rounded bg-gray-700 text-green-400 text-xs">https://api.anthropic.com/v1</code></p>
                            <p>API密钥将安全存储在本地浏览器中，不会被发送到任何服务器。</p>
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t border-gray-700">
                        {activeTab !== 'ai-models' ? (
                          <>
                            {activeTab === 'advanced' ? (
                              <div className={`rounded-lg border px-3 py-3 text-sm ${
                                theme === 'dark'
                                  ? 'border-gray-700 bg-gray-800/60 text-gray-300'
                                  : 'border-gray-200 bg-white text-gray-600'
                              }`}>
                                先在左侧卡片中选择集群查看状态。新建或编辑时会弹出配置面板，保存和测试都在面板中完成。
                              </div>
                            ) : (
                              <>
                                <button 
                                  onClick={handleSaveSettings}
                                  disabled={clusterSaving || clusterTesting}
                                  className={`w-full py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium ${
                                    theme === 'dark' 
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60' 
                                      : 'bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-60'
                                  }`}
                                >
                                  <Save size={16} />
                                  <span>保存设置</span>
                                </button>
                                <button 
                                  onClick={handleCancelSettings}
                                  className={`w-full mt-3 py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium ${
                                    theme === 'dark' 
                                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                  }`}
                                >
                                  <XIcon size={16} />
                                  <span>取消</span>
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="text-center text-sm opacity-70">
                            <p>配置会自动保存</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {isClusterEditorOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  >
                    <div
                      className="absolute inset-0 bg-black bg-opacity-55"
                      onClick={closeClusterEditor}
                    ></div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                      className={`relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border ${
                        theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className={`flex items-start justify-between border-b px-6 py-5 ${
                        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                      }`}>
                        <div>
                          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {clusterEditorMode === 'create' ? '新建集群配置' : '编辑集群配置'}
                          </h3>
                          <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {clusterEditorMode === 'create'
                              ? '先填写接入信息并保存，保存后会生成一张集群卡片。'
                              : '修改接入信息后可直接测试连接，确认无误再关闭面板。'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={closeClusterEditor}
                          className={`rounded-lg p-2 ${
                            theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <XIcon size={18} />
                        </button>
                      </div>

                      <div className="overflow-y-auto px-6 py-5">
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_320px]">
                          <div className="space-y-5">
                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                集群名称
                              </label>
                              <input
                                type="text"
                                value={clusterConfig.name}
                                onChange={(e) => updateClusterConfig({ name: e.target.value })}
                                placeholder="例如：生产集群"
                                className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                  theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                              />
                            </div>

                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                认证方式
                              </label>
                              <select
                                value={clusterConfig.mode}
                                onChange={(e) => updateClusterConfig({ mode: e.target.value as ClusterMode })}
                                className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                  theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                              >
                                <option value="token">令牌</option>
                                <option value="kubeconfig">KubeConfig</option>
                                <option value="in-cluster">服务账户（集群内）</option>
                              </select>
                            </div>

                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                API 服务器地址
                              </label>
                              <input
                                type="text"
                                value={clusterConfig.apiServer}
                                onChange={(e) => updateClusterConfig({ apiServer: e.target.value })}
                                placeholder={clusterConfig.mode === 'in-cluster' ? '集群内模式无需填写' : '例如：https://172.29.7.1:6443'}
                                disabled={clusterConfig.mode === 'in-cluster'}
                                className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                  theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white disabled:bg-gray-800 disabled:text-gray-500' : 'border-gray-300 bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500'
                                } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                              />
                            </div>

                            {clusterConfig.mode === 'token' && (
                              <>
                                <div>
                                  <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    访问令牌
                                  </label>
                                  <textarea
                                    value={clusterConfig.token}
                                    onChange={(e) => updateClusterConfig({ token: e.target.value })}
                                    placeholder={clusterConfig.hasToken ? '已配置 token，留空则保持不变' : '请输入 ServiceAccount token'}
                                    rows={5}
                                    className={`block w-full rounded-lg border px-3 py-2 text-sm ${
                                      theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                    } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                                  />
                                </div>

                                <div>
                                  <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    CA 证书
                                  </label>
                                  <textarea
                                    value={clusterConfig.caData}
                                    onChange={(e) => updateClusterConfig({ caData: e.target.value })}
                                    placeholder="可填写 certificate-authority-data，留空则保持当前值"
                                    rows={4}
                                    className={`block w-full rounded-lg border px-3 py-2 text-sm ${
                                      theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                    } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                                  />
                                </div>
                              </>
                            )}

                            {clusterConfig.mode === 'kubeconfig' && (
                              <>
                                <div>
                                  <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    KubeConfig 路径
                                  </label>
                                  <input
                                    type="text"
                                    value={clusterConfig.kubeconfigPath}
                                    onChange={(e) => updateClusterConfig({ kubeconfigPath: e.target.value })}
                                    placeholder={clusterConfig.hasKubeconfig ? '已配置路径，留空则保持不变' : '例如：/root/.kube/config'}
                                    className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                      theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                    } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                                  />
                                </div>

                                <div>
                                  <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    KubeConfig 内容
                                  </label>
                                  <textarea
                                    value={clusterConfig.kubeconfig}
                                    onChange={(e) => updateClusterConfig({ kubeconfig: e.target.value })}
                                    placeholder="也可以直接粘贴 kubeconfig 内容"
                                    rows={7}
                                    className={`block w-full rounded-lg border px-3 py-2 text-sm ${
                                      theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                    } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          <div className="space-y-4">
                            <div className={`rounded-xl border p-4 ${
                              theme === 'dark' ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50'
                            }`}>
                              <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                                连接状态
                              </h4>
                              <div className="mt-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getClusterStatusMeta(clusterConfig.id ? clusterConfig.lastConnectionStatus : 'not_configured').badgeClass}`}>
                                  {(clusterConfig.id ? clusterConfig.lastConnectionStatus : 'not_configured') === 'connected' ? (
                                    <CheckCircle size={12} className="mr-1.5" />
                                  ) : (clusterConfig.id ? clusterConfig.lastConnectionStatus : 'not_configured') === 'error' ? (
                                    <AlertCircle size={12} className="mr-1.5" />
                                  ) : (
                                    <RefreshCw size={12} className="mr-1.5" />
                                  )}
                                  {getClusterStatusMeta(clusterConfig.id ? clusterConfig.lastConnectionStatus : 'not_configured').label}
                                </span>
                              </div>
                              <p className={`mt-3 text-xs leading-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {(clusterConfig.id ? clusterConfig.lastConnectionStatus : 'not_configured') === 'connected'
                                  ? '当前凭证已验证通过。'
                                  : (clusterConfig.id ? clusterConfig.lastConnectionStatus : 'not_configured') === 'error'
                                    ? '当前凭证存在问题，建议修正后重新测试。'
                                    : '保存后可点击“测试连接”立即验证。'}
                              </p>
                              {clusterConfig.id && clusterConfig.lastConnectionStatus === 'error' && clusterConfig.lastConnectionError && (
                                <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                                  theme === 'dark' ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700'
                                }`}>
                                  {clusterConfig.lastConnectionError}
                                </div>
                              )}
                            </div>

                            <div className={`rounded-xl border p-4 ${
                              theme === 'dark' ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50'
                            }`}>
                              <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                                集群选项
                              </h4>
                              <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>启用集群</p>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>关闭后保留配置，但不参与资源读取。</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={clusterConfig.isEnabled} onChange={(e) => updateClusterConfig({ isEnabled: e.target.checked })} className="sr-only peer" />
                                    <div className={`h-5 w-9 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                    <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-all peer-checked:translate-x-4"></div>
                                  </label>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>设为默认集群</p>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>未指定 clusterId 时默认使用它。</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={clusterConfig.isDefault} onChange={(e) => updateClusterConfig({ isDefault: e.target.checked })} className="sr-only peer" />
                                    <div className={`h-5 w-9 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                    <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-all peer-checked:translate-x-4"></div>
                                  </label>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>跳过 TLS 校验</p>
                                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>仅建议测试环境临时开启。</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={clusterConfig.insecureSkipTLSVerify} onChange={(e) => updateClusterConfig({ insecureSkipTLSVerify: e.target.checked })} className="sr-only peer" />
                                    <div className={`h-5 w-9 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                    <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-all peer-checked:translate-x-4"></div>
                                  </label>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:justify-end ${
                        theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50/70'
                      }`}>
                        <button
                          type="button"
                          onClick={closeClusterEditor}
                          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                            theme === 'dark'
                              ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <XIcon size={15} className="mr-2" />
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleTestClusterConnection}
                          disabled={clusterSaving || clusterTesting}
                          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                            theme === 'dark'
                              ? 'bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-60'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-60'
                          }`}
                        >
                          <RefreshCw size={15} className={`mr-2 ${clusterTesting ? 'animate-spin' : ''}`} />
                          {clusterTesting ? '测试中...' : '测试连接'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSaveClusterConfig(); }}
                          disabled={clusterSaving || clusterTesting}
                          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                            theme === 'dark'
                              ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
                              : 'bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60'
                          }`}
                        >
                          <Save size={15} className="mr-2" />
                          {clusterSaving ? '保存中...' : '保存配置'}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
                
                {/* 添加新模型的弹窗 */}
                {isAddingModel && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  >
                    <div 
                      className="absolute inset-0 bg-black bg-opacity-50"
                      onClick={() => {
                        setIsAddingModel(false);
                        setNewModel({
                          id: '',
                          name: '',
                          apiBaseUrl: '',
                          apiKey: '',
                          modelType: 'openai',
                          isDefault: false
                        });
                      }}
                    ></div>
                    <motion.div 
                      initial={{ y: -50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -50, opacity: 0 }}
                      className={`w-full max-w-md rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} shadow-lg p-5 relative z-10`}
                    >
                      <h3 className="text-lg font-bold mb-4">添加 AI 模型</h3>
                      <div className="space-y-4">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            模型名称
                          </label>
                          <input
                            type="text"
                            value={newModel.name}
                            onChange={(e) => setNewModel({...newModel, name: e.target.value})}
                            placeholder="例如：OpenAI GPT-4o"
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            API 基础地址
                          </label>
                          <input
                            type="text"
                            value={newModel.apiBaseUrl}
                            onChange={(e) => setNewModel({...newModel, apiBaseUrl: e.target.value})}
                            placeholder="例如：https://api.openai.com/v1"
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            API 密钥
                          </label>
                          <input
                            type="password"
                            value={newModel.apiKey}
                            onChange={(e) => setNewModel({...newModel, apiKey: e.target.value})}
                            placeholder="sk-..."
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            模型类型
                          </label>
                          <select
                            value={newModel.modelType}
                            onChange={(e) => setNewModel({...newModel, modelType: e.target.value})}
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="other">其他</option>
                          </select>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="new-model-default"
                            checked={newModel.isDefault}
                            onChange={(e) => setNewModel({...newModel, isDefault: e.target.checked})}
                            className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                          />
                          <label htmlFor="new-model-default" className="ml-2 text-sm">
                            设置为默认模型
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end space-x-3 mt-6">
                        <button 
                          onClick={() => {
                            setIsAddingModel(false);
                            setNewModel({
                              id: '',
                              name: '',
                              apiBaseUrl: '',
                              apiKey: '',
                              modelType: 'openai',
                              isDefault: false
                            });
                          }}
                          className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} text-sm font-medium`}
                        >
                          取消
                        </button>
                        <button 
                          onClick={handleAddModel}
                          className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white text-sm font-medium`}
                        >
                          添加
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </main>
        </div>
      </div>
    );
  };

  export default SettingsPage;
