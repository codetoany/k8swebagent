  import { useState, useEffect } from 'react';
  import { motion } from 'framer-motion';
  import { 
    Server, BarChart3, Database, Network, Settings, LogOut, 
    Moon, Sun, Menu, X, Bell, 
    RefreshCw, PlusCircle,
    AlertCircle, CheckCircle,
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
  import { auditAPI, clustersAPI, replacePathParams, settingsAPI } from '@/lib/api';
  import { type ClusterConfig, type ClusterMode, createEmptyClusterConfig } from '@/lib/clusters';
  import TablePagination from '@/components/TablePagination';
  import NotificationCenter from '@/components/NotificationCenter';

  // 定义设置选项类型
  type ThemeOption = 'light' | 'dark' | 'system';
  type NotificationOption = 'all' | 'critical' | 'none';
  type LanguageOption = 'zh-CN' | 'en-US';
  type NotificationType = 'node' | 'pod' | 'workload';
  type NavigationPosition = 'left' | 'top';
  type SettingsEditorMode = 'general' | 'notifications' | 'appearance';
  type SettingsTab = 'general' | 'notifications' | 'appearance' | 'advanced' | 'audit' | 'ai-models';
  
  // 定义AI模型类型
  interface AIModel {
    id: string;
    name: string;
    apiBaseUrl: string;
    apiKey: string;
    modelType: string;
    isDefault: boolean;
    hasApiKey?: boolean;
  }

  interface AuditLogEntry {
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

  interface AuditLogListResponse {
    items: AuditLogEntry[];
    total: number;
    page: number;
    pageSize: number;
  }

  interface NotificationSettingsResponse {
    level: NotificationOption;
    enabledTypes: NotificationType[];
  }

  interface SystemSettingsResponse {
    theme: ThemeOption;
    language: LanguageOption;
    autoRefreshInterval: number;
    showResourceUsage: boolean;
    showEvents: boolean;
    showNamespaceDistribution: boolean;
    navigationPosition: NavigationPosition;
    notifications: NotificationSettingsResponse;
  }

  const createDefaultSystemSettings = (): SystemSettingsResponse => ({
    theme: 'system',
    language: 'zh-CN',
    autoRefreshInterval: 30,
    showResourceUsage: true,
    showEvents: true,
    showNamespaceDistribution: true,
    navigationPosition: 'left',
    notifications: {
      level: 'all',
      enabledTypes: ['node', 'pod', 'workload'],
    },
  });

  type ClusterEditorMode = 'create' | 'edit';

  const SettingsPage = () => {
    const { theme, setTheme, toggleTheme, isDark } = useThemeContext();
    const { clusters, refreshClusters } = useClusterContext();
    const { logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    
    // 设置表单状态
    const [themeOption, setThemeOption] = useState<ThemeOption>('system');
    const [notificationOption, setNotificationOption] = useState<NotificationOption>('all');
    const [languageOption, setLanguageOption] = useState<LanguageOption>('zh-CN');
    const [autoRefresh, setAutoRefresh] = useState<number>(30);
    const [showResourceUsage, setShowResourceUsage] = useState(true);
    const [showEvents, setShowEvents] = useState(true);
    const [showNamespaceDistribution, setShowNamespaceDistribution] = useState(true);
    const [navigationPosition, setNavigationPosition] = useState<NavigationPosition>('left');
    const [notificationEnabledTypes, setNotificationEnabledTypes] = useState<NotificationType[]>(['node', 'pod', 'workload']);
    const [savedSystemSettings, setSavedSystemSettings] = useState<SystemSettingsResponse>(createDefaultSystemSettings);
    const [settingsSaving, setSettingsSaving] = useState<SettingsEditorMode | ''>('');
    const [isSettingsEditorOpen, setIsSettingsEditorOpen] = useState(false);
    const [settingsEditorMode, setSettingsEditorMode] = useState<SettingsEditorMode>('general');
    const [clusterConfig, setClusterConfig] = useState<ClusterConfig>(createEmptyClusterConfig);
    const [savedClusterConfig, setSavedClusterConfig] = useState<ClusterConfig>(createEmptyClusterConfig);
    const [selectedClusterConfigId, setSelectedClusterConfigId] = useState('');
    const [clusterSaving, setClusterSaving] = useState(false);
    const [clusterTesting, setClusterTesting] = useState(false);
    const [isClusterEditorOpen, setIsClusterEditorOpen] = useState(false);
    const [clusterEditorMode, setClusterEditorMode] = useState<ClusterEditorMode>('create');
    const [clusterActionLoadingId, setClusterActionLoadingId] = useState('');
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [auditLogsLoading, setAuditLogsLoading] = useState(false);
    const [auditRefreshNonce, setAuditRefreshNonce] = useState(0);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditCurrentPage, setAuditCurrentPage] = useState(1);
    const [auditPageSize, setAuditPageSize] = useState(10);
    const [auditStatusFilter, setAuditStatusFilter] = useState('');
    const [auditActionFilter, setAuditActionFilter] = useState('');
    const [auditResourceTypeFilter, setAuditResourceTypeFilter] = useState('');
    const [auditQuery, setAuditQuery] = useState('');
    const [aiModelsSaving, setAiModelsSaving] = useState(false);
    
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

    const getAuditActionLabel = (action: string) => {
      switch (action) {
        case 'cluster.create':
          return '新增集群';
        case 'cluster.update':
          return '更新集群';
        case 'cluster.delete':
          return '删除集群';
        case 'cluster.test':
          return '测试连接';
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
        case 'pod.restart':
          return '重启 Pod';
        case 'pod.delete':
          return '删除 Pod';
        case 'node.cordon':
          return '节点禁止调度';
        case 'node.uncordon':
          return '节点恢复调度';
        case 'workload.pause':
          return '暂停工作负载';
        case 'workload.resume':
          return '恢复工作负载';
        case 'node.maintenance.enable':
          return '开启维护污点';
        case 'node.maintenance.disable':
          return '清除维护污点';
        default:
          return action;
      }
    };

    const getAuditStatusMeta = (status: AuditLogEntry['status']) => {
      if (status === 'success') {
        return {
          label: '成功',
          badgeClass: theme === 'dark'
            ? 'border border-green-500/30 bg-green-500/10 text-green-300'
            : 'border border-green-200 bg-green-50 text-green-700',
        };
      }

      return {
        label: '失败',
        badgeClass: theme === 'dark'
          ? 'border border-red-500/30 bg-red-500/10 text-red-300'
          : 'border border-red-200 bg-red-50 text-red-700',
      };
    };

    const auditActionOptions = [
      { value: '', label: '全部动作' },
      { value: 'cluster.create', label: '新增集群' },
      { value: 'cluster.update', label: '更新集群' },
      { value: 'cluster.delete', label: '删除集群' },
      { value: 'cluster.test', label: '测试连接' },
      { value: 'settings.update', label: '更新通用设置' },
      { value: 'settings.notifications.update', label: '更新通知设置' },
      { value: 'settings.ai-models.update', label: '更新 AI 模型' },
      { value: 'workload.scale', label: '扩缩容' },
      { value: 'workload.restart', label: '重启工作负载' },
      { value: 'workload.delete', label: '删除工作负载' },
      { value: 'pod.delete', label: '删除 Pod' },
      { value: 'pod.restart', label: '重启 Pod' },
      { value: 'node.cordon', label: '节点禁止调度' },
      { value: 'node.uncordon', label: '节点恢复调度' },
      { value: 'workload.pause', label: '暂停工作负载' },
      { value: 'workload.resume', label: '恢复工作负载' },
      { value: 'node.maintenance.enable', label: '开启维护污点' },
      { value: 'node.maintenance.disable', label: '清除维护污点' },
    ];

    const auditResourceTypeOptions = [
      { value: '', label: '全部资源' },
      { value: 'cluster', label: '集群' },
      { value: 'settings', label: '设置' },
      { value: 'pod', label: 'Pod' },
      { value: 'node', label: '节点' },
      { value: 'deployments', label: 'Deployment' },
      { value: 'statefulsets', label: 'StatefulSet' },
      { value: 'daemonsets', label: 'DaemonSet' },
      { value: 'cronjobs', label: 'CronJob' },
    ];

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

    const openSettingsEditor = (mode: SettingsEditorMode) => {
      setSettingsEditorMode(mode);
      setIsSettingsEditorOpen(true);
    };

    const closeSettingsEditor = () => {
      setIsSettingsEditorOpen(false);
    };

    const cancelSettingsEditor = () => {
      applySystemSettings(savedSystemSettings);
      setIsSettingsEditorOpen(false);
    };

    const toggleNotificationType = (type: NotificationType) => {
      setNotificationEnabledTypes((current) => (
        current.includes(type)
          ? current.filter((item) => item !== type)
          : [...current, type]
      ));
    };

    const applySystemSettings = (settings: SystemSettingsResponse) => {
      setThemeOption(settings.theme);
      setTheme(settings.theme);
      setLanguageOption(settings.language);
      setAutoRefresh(settings.autoRefreshInterval);
      setShowResourceUsage(settings.showResourceUsage);
      setShowEvents(settings.showEvents);
      setShowNamespaceDistribution(settings.showNamespaceDistribution ?? true);
      setNavigationPosition(settings.navigationPosition ?? 'left');
      setNotificationOption(settings.notifications?.level ?? 'all');
      setNotificationEnabledTypes(settings.notifications?.enabledTypes ?? ['node', 'pod', 'workload']);
    };
    
    // 接入只读设置接口
    useEffect(() => {
      let active = true;

      const loadSettings = async () => {
        setLoading(true);
        try {
          const [settings, models] = await Promise.all([
            apiClient.get<SystemSettingsResponse>(settingsAPI.getSettings),
            apiClient.get<AIModel[]>(settingsAPI.getAIModels),
            loadClusterConfig(),
          ]);

          if (!active) {
            return;
          }

          const normalizedSettings = {
            ...createDefaultSystemSettings(),
            ...settings,
            notifications: {
              ...createDefaultSystemSettings().notifications,
              ...settings?.notifications,
            },
          } satisfies SystemSettingsResponse;

          setSavedSystemSettings(normalizedSettings);
          applySystemSettings(normalizedSettings);
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

    useEffect(() => {
      let active = true;

      const loadAuditLogs = async () => {
        if (activeTab !== 'audit') {
          return;
        }

        setAuditLogsLoading(true);
        try {
          const logs = await apiClient.get<AuditLogListResponse>(
            auditAPI.listAuditLogs,
            {
              page: auditCurrentPage,
              limit: auditPageSize,
              ...(selectedClusterConfigId ? { clusterId: selectedClusterConfigId } : {}),
              ...(auditStatusFilter ? { status: auditStatusFilter } : {}),
              ...(auditActionFilter ? { action: auditActionFilter } : {}),
              ...(auditResourceTypeFilter ? { resourceType: auditResourceTypeFilter } : {}),
              ...(auditQuery.trim() ? { query: auditQuery.trim() } : {}),
            },
          );

          if (active) {
            setAuditLogs(Array.isArray(logs?.items) ? logs.items : []);
            setAuditTotal(logs?.total ?? 0);
          }
        } finally {
          if (active) {
            setAuditLogsLoading(false);
          }
        }
      };

      void loadAuditLogs();

      return () => {
        active = false;
      };
    }, [
      activeTab,
      selectedClusterConfigId,
      auditRefreshNonce,
      auditCurrentPage,
      auditPageSize,
      auditStatusFilter,
      auditActionFilter,
      auditResourceTypeFilter,
      auditQuery,
    ]);

    useEffect(() => {
      setAuditCurrentPage(1);
    }, [
      activeTab,
      selectedClusterConfigId,
      auditStatusFilter,
      auditActionFilter,
      auditResourceTypeFilter,
      auditQuery,
      auditPageSize,
    ]);

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
      setTheme(option);
    };

    const persistSystemSettings = async () => {
      setSettingsSaving(settingsEditorMode);
      try {
        const payload: SystemSettingsResponse = {
          theme: themeOption,
          language: languageOption,
          autoRefreshInterval: autoRefresh,
          showResourceUsage,
          showEvents,
          showNamespaceDistribution,
          navigationPosition,
          notifications: {
            level: notificationOption,
            enabledTypes: notificationEnabledTypes,
          },
        };

        await apiClient.put<SystemSettingsResponse>(settingsAPI.updateSettings, payload);
        setSavedSystemSettings(payload);
        toast.success('设置已保存');
        closeSettingsEditor();
      } finally {
        setSettingsSaving('');
      }
    };

    const persistNotificationSettings = async () => {
      setSettingsSaving('notifications');
      try {
        await apiClient.put<NotificationSettingsResponse>(
          settingsAPI.updateNotificationSettings,
          {
            level: notificationOption,
            enabledTypes: notificationEnabledTypes,
          },
        );
        setSavedSystemSettings((current) => ({
          ...current,
          notifications: {
            level: notificationOption,
            enabledTypes: notificationEnabledTypes,
          },
        }));
        toast.success('通知设置已保存');
        closeSettingsEditor();
      } finally {
        setSettingsSaving('');
      }
    };

    const persistAIModels = async (models: AIModel[]) => {
      setAiModelsSaving(true);
      try {
        const savedModels = await apiClient.put<AIModel[]>(settingsAPI.updateAIModels, models);
        setAiModels(savedModels.map((model) => ({ ...model, apiKey: model.apiKey ?? '' })));
      } finally {
        setAiModelsSaving(false);
      }
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
        setAuditRefreshNonce((value) => value + 1);
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
          setAuditRefreshNonce((value) => value + 1);
          return;
        }

        toast.error(result.message || '连接测试失败');
        setAuditRefreshNonce((value) => value + 1);
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
        setAuditRefreshNonce((value) => value + 1);
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
        setAuditRefreshNonce((value) => value + 1);
      } finally {
        setClusterActionLoadingId('');
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
    
    // 添加AI模型
    const handleAddModel = async () => {
      if (!newModel.id || !newModel.name || !newModel.apiBaseUrl) {
        toast('请填写模型标识、模型名称和 API 地址');
        return;
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
        id: newModel.id.trim(),
        name: newModel.name.trim(),
        apiBaseUrl: newModel.apiBaseUrl.trim(),
        apiKey: newModel.apiKey.trim(),
      };
      
      updatedModels.push(modelToAdd);
      await persistAIModels(updatedModels);
      
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
      toast.success('AI模型已添加');
    };
    
    // 编辑AI模型
    const handleEditModel = (model: AIModel) => {
      setEditingModel({...model});
    };
    
    // 保存编辑的模型
    const handleSaveEdit = async () => {
      if (!editingModel || !editingModel.id || !editingModel.name || !editingModel.apiBaseUrl) {
        toast('请填写模型标识、模型名称和 API 地址');
        return;
        toast('请填写模型名称和API基础地址');
        return;
      }
      
      const normalizedEditingModel = {
        ...editingModel,
        id: editingModel.id.trim(),
        name: editingModel.name.trim(),
        apiBaseUrl: editingModel.apiBaseUrl.trim(),
        apiKey: editingModel.apiKey.trim(),
      };

      const updatedModels = aiModels.map(model => {
        if (model.id === editingModel.id) {
          return normalizedEditingModel;
        }
        // 如果编辑的模型设置为默认，取消其他模型的默认状态
        if (normalizedEditingModel.isDefault) {
          return {...model, isDefault: false};
        }
        return model;
      });
      
      await persistAIModels(updatedModels);
      setEditingModel(null);
      toast.success('AI模型已更新');
    };
    
    // 删除AI模型
    const handleDeleteModel = async (id: string) => {
      if (aiModels.length <= 1) {
        toast('至少需要保留一个AI模型');
        return;
      }
      
      const updatedModels = aiModels.filter(model => model.id !== id);
      await persistAIModels(updatedModels);
      toast.success('AI模型已删除');
    };
    
    // 设置默认模型
    const handleSetDefault = async (id: string) => {
      const updatedModels = aiModels.map(model => ({
        ...model,
        isDefault: model.id === id
      }));
      await persistAIModels(updatedModels);
      toast.success('默认模型已设置');
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

    const notificationTypeLabels: Record<NotificationType, string> = {
      node: '节点状态',
      pod: 'Pod 事件',
      workload: '工作负载变更',
    };

    const themeLabelMap: Record<ThemeOption, string> = {
      light: '亮色模式',
      dark: '暗色模式',
      system: '跟随系统',
    };

    const languageLabelMap: Record<LanguageOption, string> = {
      'zh-CN': '简体中文',
      'en-US': 'English (US)',
    };

    const notificationLevelLabelMap: Record<NotificationOption, string> = {
      all: '所有通知',
      critical: '仅关键通知',
      none: '关闭全部通知',
    };

    const renderSettingsCard = (
      title: string,
      description: string,
      badge: string,
      lines: string[],
      onEdit: () => void,
      icon: React.ReactNode,
    ) => (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`rounded-xl border p-4 ${
          theme === 'dark' ? 'border-gray-700 bg-gray-800/70' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {title}
              </h4>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                theme === 'dark' ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'
              }`}>
                {badge}
              </span>
            </div>
            <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {description}
            </p>
          </div>
          <div className={`rounded-lg p-2 ${theme === 'dark' ? 'bg-gray-700 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
            {icon}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {lines.map((line) => (
            <div key={line} className={`rounded-lg px-3 py-2 ${
              theme === 'dark' ? 'bg-gray-900/50 text-gray-300' : 'bg-gray-50 text-gray-600'
            }`}>
              {line}
            </div>
          ))}
        </div>

        <div className={`mt-4 border-t pt-4 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            type="button"
            onClick={onEdit}
            className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium ${
              theme === 'dark'
                ? 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <Edit size={13} className="mr-1.5" />
            编辑
          </button>
        </div>
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
                 {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
                 {renderNavItem(<Server size={20} />, '节点', '/nodes')}
                 {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
                 {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
                 {renderNavItem(<Shield size={20} />, '操作审计', '/audit-logs')}
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
            {renderNavItem(<Shield size={20} />, '操作审计', '/audit-logs')}
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
                  {isDark ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <NotificationCenter />
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
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
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
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                通用设置
                              </h3>
                              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                将主题、语言和刷新策略整理成摘要卡片，点编辑再进入配置面板。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openSettingsEditor('general')}
                              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                                theme === 'dark'
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                              }`}
                            >
                              <Edit size={16} className="mr-2" />
                              编辑通用设置
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            {renderSettingsCard(
                              '主题与语言',
                              '统一管理界面主题和使用语言。',
                              themeLabelMap[themeOption],
                              [
                                `当前主题：${themeLabelMap[themeOption]}`,
                                `界面语言：${languageLabelMap[languageOption]}`,
                              ],
                              () => openSettingsEditor('general'),
                              <Moon size={18} />,
                            )}
                            {renderSettingsCard(
                              '刷新策略',
                              '控制资源页轮询节奏和默认行为。',
                              autoRefresh === 0 ? '已关闭自动刷新' : `${autoRefresh} 秒`,
                              [
                                autoRefresh === 0 ? '自动刷新：手动触发' : `自动刷新：每 ${autoRefresh} 秒`,
                                '修改后会同步保存到后端设置接口',
                              ],
                              () => openSettingsEditor('general'),
                              <RefreshCw size={18} />,
                            )}
                          </div>
                        </>
                      )}

                      {activeTab === 'notifications' && (
                        <>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                通知设置
                              </h3>
                              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                这部分现在走真实后端接口，保存后会落库，不再只是前端占位。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openSettingsEditor('notifications')}
                              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                                theme === 'dark'
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                              }`}
                            >
                              <Edit size={16} className="mr-2" />
                              编辑通知设置
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            {renderSettingsCard(
                              '通知级别',
                              '控制系统发送的通知范围。',
                              notificationLevelLabelMap[notificationOption],
                              [
                                `当前策略：${notificationLevelLabelMap[notificationOption]}`,
                                notificationOption === 'none' ? '当前不会推送任何通知' : '可进一步勾选需要的通知类型',
                              ],
                              () => openSettingsEditor('notifications'),
                              <Bell size={18} />,
                            )}
                            {renderSettingsCard(
                              '通知类型',
                              '按资源种类筛选真正需要关注的事件。',
                              `${notificationEnabledTypes.length} 项已启用`,
                              notificationEnabledTypes.length > 0
                                ? notificationEnabledTypes.map((type) => `已启用：${notificationTypeLabels[type]}`)
                                : ['当前未启用任何通知类型'],
                              () => openSettingsEditor('notifications'),
                              <BellRing size={18} />,
                            )}
                          </div>
                        </>
                      )}

                      {activeTab === 'appearance' && (
                        <>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                外观设置
                              </h3>
                              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                将仪表盘显隐项和布局偏好收成卡片，保持和集群接入一致的编辑体验。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openSettingsEditor('appearance')}
                              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                                theme === 'dark'
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                              }`}
                            >
                              <Edit size={16} className="mr-2" />
                              编辑外观设置
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            {renderSettingsCard(
                              '仪表盘组件',
                              '控制默认展示的监控区块。',
                              `${[showResourceUsage, showEvents, showNamespaceDistribution].filter(Boolean).length}/3 已启用`,
                              [
                                `资源使用图表：${showResourceUsage ? '显示' : '隐藏'}`,
                                `最近事件：${showEvents ? '显示' : '隐藏'}`,
                                `命名空间分布：${showNamespaceDistribution ? '显示' : '隐藏'}`,
                              ],
                              () => openSettingsEditor('appearance'),
                              <BarChart size={18} />,
                            )}
                            {renderSettingsCard(
                              '导航布局',
                              '记录系统偏好的导航布局方案。',
                              navigationPosition === 'left' ? '左侧导航' : '顶部导航',
                              [
                                `导航位置：${navigationPosition === 'left' ? '左侧' : '顶部'}`,
                                '保存后会同步写入设置中心',
                              ],
                              () => openSettingsEditor('appearance'),
                              <Settings size={18} />,
                            )}
                          </div>
                        </>
                      )}

                      {activeTab === 'audit' && (
                        <>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                操作审计
                              </h3>
                              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                单独查看集群接入、设置变更和资源写操作的审计记录，不再塞在高级设置里。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAuditRefreshNonce((value) => value + 1)}
                              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium ${
                                theme === 'dark'
                                  ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                            >
                              <RefreshCw size={13} className={`mr-1.5 ${auditLogsLoading ? 'animate-spin' : ''}`} />
                              刷新
                            </button>
                          </div>

                          <div className={`rounded-xl border p-4 ${
                            theme === 'dark' ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-white'
                          }`}>
                            <div className="space-y-4">
                              <div className="grid gap-3 md:grid-cols-4">
                                <div className="md:col-span-2">
                                  <input
                                    type="text"
                                    value={auditQuery}
                                    onChange={(event) => setAuditQuery(event.target.value)}
                                    placeholder="搜索资源名称、结果信息或操作人"
                                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                                      theme === 'dark'
                                        ? 'border-gray-600 bg-gray-900 text-white'
                                        : 'border-gray-200 bg-white text-gray-900'
                                    }`}
                                  />
                                </div>
                                <select
                                  value={auditStatusFilter}
                                  onChange={(event) => setAuditStatusFilter(event.target.value)}
                                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                                    theme === 'dark'
                                      ? 'border-gray-600 bg-gray-900 text-white'
                                      : 'border-gray-200 bg-white text-gray-900'
                                  }`}
                                >
                                  <option value="">全部结果</option>
                                  <option value="success">成功</option>
                                  <option value="failed">失败</option>
                                </select>
                                <select
                                  value={auditActionFilter}
                                  onChange={(event) => setAuditActionFilter(event.target.value)}
                                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                                    theme === 'dark'
                                      ? 'border-gray-600 bg-gray-900 text-white'
                                      : 'border-gray-200 bg-white text-gray-900'
                                  }`}
                                >
                                  {auditActionOptions.map((option) => (
                                    <option key={option.value || 'all'} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="grid gap-3 md:grid-cols-4">
                                <select
                                  value={auditResourceTypeFilter}
                                  onChange={(event) => setAuditResourceTypeFilter(event.target.value)}
                                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                                    theme === 'dark'
                                      ? 'border-gray-600 bg-gray-900 text-white'
                                      : 'border-gray-200 bg-white text-gray-900'
                                  }`}
                                >
                                  {auditResourceTypeOptions.map((option) => (
                                    <option key={option.value || 'all'} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <div className={`md:col-span-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                                  theme === 'dark'
                                    ? 'border-gray-700 bg-gray-900/40 text-gray-400'
                                    : 'border-gray-200 bg-gray-50 text-gray-500'
                                }`}>
                                  <span>当前集群过滤：{selectedClusterConfigId || '全部集群'}</span>
                                  {(auditQuery || auditStatusFilter || auditActionFilter || auditResourceTypeFilter) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAuditQuery('');
                                        setAuditStatusFilter('');
                                        setAuditActionFilter('');
                                        setAuditResourceTypeFilter('');
                                      }}
                                      className={`rounded-lg px-2 py-1 ${
                                        theme === 'dark'
                                          ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                          : 'bg-white text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      清空筛选
                                    </button>
                                  )}
                                </div>
                              </div>

                              {auditLogsLoading ? (
                                <div className={`rounded-lg border px-4 py-6 text-sm ${
                                  theme === 'dark' ? 'border-gray-700 bg-gray-900/40 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
                                }`}>
                                  正在加载审计日志...
                                </div>
                              ) : auditLogs.length === 0 ? (
                                <div className={`rounded-lg border px-4 py-6 text-sm ${
                                  theme === 'dark' ? 'border-gray-700 bg-gray-900/40 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
                                }`}>
                                  当前还没有可显示的操作记录。
                                </div>
                              ) : (
                                auditLogs.map((entry) => {
                                  const statusMeta = getAuditStatusMeta(entry.status);
                                  return (
                                    <div
                                      key={entry.id}
                                      className={`rounded-lg border px-4 py-3 ${
                                        theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'
                                      }`}
                                    >
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badgeClass}`}>
                                              {statusMeta.label}
                                            </span>
                                            <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                              {getAuditActionLabel(entry.action)}
                                            </span>
                                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                              {entry.namespace ? `${entry.namespace}/` : ''}{entry.resourceName || '-'}
                                            </span>
                                          </div>
                                          <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                            {entry.message || '已记录操作结果'}
                                          </p>
                                          <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${
                                            theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                                          }`}>
                                            <span>资源类型：{entry.resourceType || '-'}</span>
                                            <span>集群：{entry.clusterName || entry.clusterId || '未指定'}</span>
                                            <span>操作人：{entry.actorName || entry.actorEmail || '系统'}</span>
                                          </div>
                                        </div>
                                        <div className={`shrink-0 text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                          {formatClusterDate(entry.createdAt)}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            {!auditLogsLoading && auditTotal > 0 && (
                              <TablePagination
                                theme={theme === 'dark' ? 'dark' : 'light'}
                                currentPage={auditCurrentPage}
                                pageSize={auditPageSize}
                                totalItems={auditTotal}
                                onPageChange={setAuditCurrentPage}
                                onPageSizeChange={(size) => {
                                  setAuditPageSize(size);
                                  setAuditCurrentPage(1);
                                }}
                              />
                            )}
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
                              disabled={aiModelsSaving}
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
                                        模型标识
                                      </label>
                                      <input
                                        type="text"
                                        value={editingModel.id}
                                        onChange={(e) => setEditingModel({...editingModel, id: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
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
                                        placeholder={editingModel.hasApiKey ? '已配置密钥，留空保持不变' : '输入 API 密钥'}
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
                                        onClick={() => { void handleSaveEdit(); }}
                                        disabled={aiModelsSaving}
                                        className={`px-3 py-1.5 text-xs font-medium rounded ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                                      >
                                        {aiModelsSaving ? '保存中...' : '保存'}
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
                                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          密钥状态: {model.hasApiKey ? '已配置' : '未配置'}
                                        </p>
                                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          模型标识: {model.id}
                                        </p>
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
                                            onClick={() => { void handleSetDefault(model.id); }}
                                            disabled={aiModelsSaving}
                                            className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} disabled:opacity-50`}
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
                                            onClick={() => { void handleDeleteModel(model.id); }}
                                            disabled={aiModelsSaving}
                                            className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-200 text-red-500'} disabled:opacity-50`}
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

                          {activeTab === 'advanced' && (
                            <div>
                              <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                <Shield size={16} className="mr-1" />
                                操作审计
                              </h3>
                              <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-gray-700/60' : 'border-gray-200 bg-white'} text-sm space-y-3`}>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                                  操作审计已经独立成左侧模块，可按集群、动作、资源类型筛选查看，不再塞在设置页内部。
                                </p>
                                <button
                                  type="button"
                                  onClick={() => navigate('/audit-logs')}
                                  className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
                                    theme === 'dark'
                                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                                      : 'bg-blue-500 text-white hover:bg-blue-600'
                                  }`}
                                >
                                  <Shield size={15} className="mr-2" />
                                  前往操作审计
                                </button>
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
                            <p>模型配置会通过设置接口保存到后端，便于多次刷新后仍可继续使用。</p>
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t border-gray-700">
                        {activeTab !== 'ai-models' ? (
                          <div className={`rounded-lg border px-3 py-3 text-sm ${
                            theme === 'dark'
                              ? 'border-gray-700 bg-gray-800/60 text-gray-300'
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}>
                            {activeTab === 'advanced'
                              ? '先在左侧卡片中选择集群查看状态。新建或编辑时会弹出配置面板，保存和测试都在面板中完成。'
                              : '左侧显示的是设置摘要卡片。点击编辑后会弹出独立配置面板，保存时直接调用真实设置接口。'}
                          </div>
                        ) : (
                          <div className="text-center text-sm opacity-70">
                            <p>{aiModelsSaving ? '正在保存模型配置...' : '模型修改后会立即同步到后端'}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {isSettingsEditorOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  >
                    <div
                      className="absolute inset-0 bg-black bg-opacity-55"
                      onClick={cancelSettingsEditor}
                    ></div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                      className={`relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border ${
                        theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className={`flex items-start justify-between border-b px-6 py-5 ${
                        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                      }`}>
                        <div>
                          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {settingsEditorMode === 'general'
                              ? '编辑通用设置'
                              : settingsEditorMode === 'notifications'
                                ? '编辑通知设置'
                                : '编辑外观设置'}
                          </h3>
                          <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {settingsEditorMode === 'general'
                              ? '修改主题、语言和刷新策略后保存到设置中心。'
                              : settingsEditorMode === 'notifications'
                                ? '通知级别和通知类型会通过真实接口保存。'
                                : '外观配置会保存为卡片摘要，便于后续继续扩展。'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={cancelSettingsEditor}
                          className={`rounded-lg p-2 ${
                            theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <XIcon size={18} />
                        </button>
                      </div>

                      <div className="overflow-y-auto px-6 py-5">
                        {settingsEditorMode === 'general' && (
                          <div className="space-y-5">
                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                主题
                              </label>
                              <div className="grid gap-3 sm:grid-cols-3">
                                {(['light', 'dark', 'system'] as ThemeOption[]).map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => handleThemeChange(option)}
                                    className={`rounded-xl border px-4 py-3 text-left text-sm ${
                                      themeOption === option
                                        ? theme === 'dark'
                                          ? 'border-blue-500 bg-blue-500/10 text-white'
                                          : 'border-blue-300 bg-blue-50 text-blue-700'
                                        : theme === 'dark'
                                          ? 'border-gray-700 bg-gray-900/40 text-gray-300'
                                          : 'border-gray-200 bg-gray-50 text-gray-700'
                                    }`}
                                  >
                                    {themeLabelMap[option]}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                              <div>
                                <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                  语言
                                </label>
                                <select
                                  value={languageOption}
                                  onChange={(e) => setLanguageOption(e.target.value as LanguageOption)}
                                  className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                    theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                  } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                                >
                                  <option value="zh-CN">简体中文</option>
                                  <option value="en-US">English (US)</option>
                                </select>
                              </div>
                              <div>
                                <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                  自动刷新间隔（秒）
                                </label>
                                <select
                                  value={autoRefresh}
                                  onChange={(e) => setAutoRefresh(parseInt(e.target.value, 10))}
                                  className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                    theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                  } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                                >
                                  <option value={10}>10</option>
                                  <option value={30}>30</option>
                                  <option value={60}>60</option>
                                  <option value={120}>120</option>
                                  <option value={300}>300</option>
                                  <option value={0}>禁用</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}

                        {settingsEditorMode === 'notifications' && (
                          <div className="space-y-5">
                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                通知级别
                              </label>
                              <div className="grid gap-3 sm:grid-cols-3">
                                {(['all', 'critical', 'none'] as NotificationOption[]).map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => setNotificationOption(option)}
                                    className={`rounded-xl border px-4 py-3 text-left text-sm ${
                                      notificationOption === option
                                        ? theme === 'dark'
                                          ? 'border-blue-500 bg-blue-500/10 text-white'
                                          : 'border-blue-300 bg-blue-50 text-blue-700'
                                        : theme === 'dark'
                                          ? 'border-gray-700 bg-gray-900/40 text-gray-300'
                                          : 'border-gray-200 bg-gray-50 text-gray-700'
                                    }`}
                                  >
                                    {notificationLevelLabelMap[option]}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                通知类型
                              </label>
                              <div className="grid gap-3 sm:grid-cols-3">
                                {(['node', 'pod', 'workload'] as NotificationType[]).map((type) => {
                                  const checked = notificationEnabledTypes.includes(type);
                                  return (
                                    <button
                                      key={type}
                                      type="button"
                                      onClick={() => toggleNotificationType(type)}
                                      className={`rounded-xl border px-4 py-3 text-left text-sm ${
                                        checked
                                          ? theme === 'dark'
                                            ? 'border-blue-500 bg-blue-500/10 text-white'
                                            : 'border-blue-300 bg-blue-50 text-blue-700'
                                          : theme === 'dark'
                                            ? 'border-gray-700 bg-gray-900/40 text-gray-300'
                                            : 'border-gray-200 bg-gray-50 text-gray-700'
                                      }`}
                                    >
                                      {notificationTypeLabels[type]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {settingsEditorMode === 'appearance' && (
                          <div className="space-y-5">
                            <div className="space-y-3">
                              {[
                                { key: 'resource', title: '显示资源使用图表', checked: showResourceUsage, onChange: setShowResourceUsage },
                                { key: 'events', title: '显示最近事件', checked: showEvents, onChange: setShowEvents },
                                { key: 'namespace', title: '显示命名空间分布', checked: showNamespaceDistribution, onChange: setShowNamespaceDistribution },
                              ].map((item) => (
                                <div key={item.key} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                                  theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'
                                }`}>
                                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-800'}`}>
                                    {item.title}
                                  </span>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={item.checked} onChange={(e) => item.onChange(e.target.checked)} className="sr-only peer" />
                                    <div className={`h-5 w-9 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                    <div className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-all peer-checked:translate-x-4"></div>
                                  </label>
                                </div>
                              ))}
                            </div>

                            <div>
                              <label className={`mb-2 block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                导航栏位置
                              </label>
                              <select
                                value={navigationPosition}
                                onChange={(e) => setNavigationPosition(e.target.value as NavigationPosition)}
                                className={`block w-full rounded-lg border px-3 py-2 text-base ${
                                  theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                                } focus:border-blue-500 focus:outline-none focus:ring-blue-500`}
                              >
                                <option value="left">左侧</option>
                                <option value="top">顶部</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:justify-end ${
                        theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50/70'
                      }`}>
                        <button
                          type="button"
                          onClick={cancelSettingsEditor}
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
                          onClick={() => {
                            if (settingsEditorMode === 'notifications') {
                              void persistNotificationSettings();
                              return;
                            }
                            void persistSystemSettings();
                          }}
                          disabled={settingsSaving !== ''}
                          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${
                            theme === 'dark'
                              ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
                              : 'bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60'
                          }`}
                        >
                          <Save size={15} className="mr-2" />
                          {settingsSaving === ''
                            ? '保存设置'
                            : settingsEditorMode === 'notifications'
                              ? '保存通知中...'
                              : '保存中...'}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}

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
                            模型标识
                          </label>
                          <input
                            type="text"
                            value={newModel.id}
                            onChange={(e) => setNewModel({...newModel, id: e.target.value})}
                            placeholder="例如：grok-4.1-fast"
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                          <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            这里填写真实的大模型标识，也就是请求里的 model 字段。
                          </p>
                        </div>
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
                            placeholder="输入新的 API 密钥"
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
                          onClick={() => { void handleAddModel(); }}
                          disabled={aiModelsSaving}
                          className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white text-sm font-medium disabled:opacity-60`}
                        >
                          {aiModelsSaving ? '添加中...' : '添加'}
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
