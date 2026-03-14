import { type KeyboardEvent, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  Brain,
  Clock,
  Database,
  History,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Network,
  Package,
  PlusCircle,
  RefreshCw,
  Send,
  Server,
  Settings,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import apiClient from '@/lib/apiClient';
import { aiDiagnosisAPI, replacePathParams } from '@/lib/api';
import ClusterSelector from '@/components/ClusterSelector';
import NotificationCenter from '@/components/NotificationCenter';

type ConversationRole = 'user' | 'assistant';

interface AIConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

interface AIConversation {
  id: string;
  title: string;
  summary: string;
  clusterId?: string;
  clusterName?: string;
  modelId?: string;
  modelName?: string;
  createdAt: string;
  updatedAt: string;
  messages?: AIConversationMessage[];
}

interface AIClusterOverview {
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

interface AIClusterNodeSummary {
  name: string;
  status: string;
  schedulable: boolean;
  cpuUsage: number;
  memoryUsage: number;
  pods: number;
  ip: string;
}

interface AIClusterPodSummary {
  namespace: string;
  name: string;
  status: string;
  node: string;
}

interface AIClusterWorkloadSummary {
  scope: string;
  namespace: string;
  name: string;
  ready: number;
  desired: number;
  available: number;
  paused: boolean;
}

interface AIClusterStatus {
  clusterId?: string;
  clusterName: string;
  connectionState: string;
  source: 'live' | 'snapshot';
  overview: AIClusterOverview;
  nodeHighlights: AIClusterNodeSummary[];
  problemPods: AIClusterPodSummary[];
  workloadAlerts: AIClusterWorkloadSummary[];
  generatedAt: string;
}

interface AIChatResponse {
  conversation: AIConversation;
  cluster: AIClusterStatus;
}

const suggestionPrompts = [
  '分析当前集群的整体健康状况',
  '排查异常 Pod 的可能原因',
  '给出资源优化和扩缩容建议',
  '总结当前最需要关注的风险点',
  '根据当前状态生成运维检查清单',
];

function createWelcomeMessage(clusterName: string): AIConversationMessage[] {
  const displayClusterName = clusterName || '默认诊断上下文';
  return [
    {
      id: 'welcome-message',
      role: 'assistant',
      content: `你好，我是 K8s Agent AI 诊断助手。当前分析集群：${displayClusterName}。\n\n你可以直接问我：\n1. 集群现在是否健康\n2. 哪些节点或 Pod 需要优先关注\n3. 资源是否存在浪费或瓶颈\n4. 某个工作负载为什么不稳定\n\n我会结合当前集群上下文给出诊断结论、风险判断和下一步建议。`,
      createdAt: new Date().toISOString(),
    },
  ];
}

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getConnectionMeta(status: string, theme: 'light' | 'dark') {
  const palette =
    theme === 'dark'
      ? {
          success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
          warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
          danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
          neutral: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
        }
      : {
          success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          warning: 'bg-amber-50 text-amber-700 border border-amber-200',
          danger: 'bg-rose-50 text-rose-700 border border-rose-200',
          neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
        };

  switch (status) {
    case 'connected':
      return { label: '已连接', badgeClass: palette.success };
    case 'error':
      return { label: '连接异常', badgeClass: palette.danger };
    case 'not_configured':
      return { label: '未配置真实集群', badgeClass: palette.warning };
    default:
      return { label: '状态未知', badgeClass: palette.neutral };
  }
}

export default function AIDiagnosis() {
  const { theme, toggleTheme } = useThemeContext();
  const { logout } = useContext(AuthContext);
  const { enabledClusters, selectedCluster, selectedClusterId, setSelectedClusterId, loading: clusterLoading } = useClusterContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshingCluster, setRefreshingCluster] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [currentConversationId, setCurrentConversationId] = useState('');
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [messages, setMessages] = useState<AIConversationMessage[]>(createWelcomeMessage('默认诊断上下文'));
  const [clusterStatus, setClusterStatus] = useState<AIClusterStatus | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isDark = theme === 'dark';
  const connectionMeta = getConnectionMeta(clusterStatus?.connectionState || 'unknown', theme);
  const welcomeClusterName = clusterStatus?.clusterName || selectedCluster?.name || '默认诊断上下文';

  const currentConversation = useMemo(
    () => conversations.find((item) => item.id === currentConversationId) || null,
    [conversations, currentConversationId],
  );

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setCurrentConversationId('');
      setMessages(createWelcomeMessage(selectedCluster?.name || '默认诊断上下文'));

      try {
        const [history, status] = await Promise.all([
          apiClient.get<AIConversation[]>(aiDiagnosisAPI.getDiagnosisHistory, selectedClusterId ? { clusterId: selectedClusterId } : undefined),
          apiClient.get<AIClusterStatus>(aiDiagnosisAPI.getNodeStatus, selectedClusterId ? { clusterId: selectedClusterId } : undefined),
        ]);

        if (cancelled) {
          return;
        }

        setConversations(history);
        setClusterStatus(status);
        setMessages(createWelcomeMessage(status.clusterName || selectedCluster?.name || '默认诊断上下文'));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [selectedCluster?.name, selectedClusterId]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const navItem = (icon: ReactNode, label: string, path: string) => {
    const active = location.pathname === path;
    return (
      <motion.div
        className={`flex items-center space-x-3 rounded-lg px-4 py-3 transition-all duration-300 ${
          active
            ? isDark
              ? 'bg-blue-900/30 text-blue-400'
              : 'bg-blue-50 text-blue-600'
            : isDark
              ? 'text-gray-300 hover:bg-gray-800'
              : 'text-gray-700 hover:bg-gray-100'
        }`}
        onClick={() => navigateTo(path)}
      >
        <span className="text-lg">{icon}</span>
        <span className="font-medium">{label}</span>
      </motion.div>
    );
  };

  const refreshClusterStatus = async () => {
    setRefreshingCluster(true);
    try {
      const status = await apiClient.get<AIClusterStatus>(
        aiDiagnosisAPI.getNodeStatus,
        selectedClusterId ? { clusterId: selectedClusterId } : undefined,
      );
      setClusterStatus(status);
      if (!currentConversationId) {
        setMessages(createWelcomeMessage(status.clusterName || welcomeClusterName));
      }
    } finally {
      setRefreshingCluster(false);
    }
  };

  const refreshHistory = async (preferredConversationId?: string) => {
    const history = await apiClient.get<AIConversation[]>(
      aiDiagnosisAPI.getDiagnosisHistory,
      selectedClusterId ? { clusterId: selectedClusterId } : undefined,
    );
    setConversations(history);
    if (preferredConversationId && history.some((item) => item.id === preferredConversationId)) {
      setCurrentConversationId(preferredConversationId);
    } else if (preferredConversationId === '') {
      setCurrentConversationId('');
    }
  };

  const loadConversation = async (conversationId: string) => {
    const detail = await apiClient.get<AIConversation>(
      replacePathParams(aiDiagnosisAPI.getConversationDetail, { id: conversationId }),
    );
    setCurrentConversationId(detail.id);
    setMessages(detail.messages?.length ? detail.messages : createWelcomeMessage(detail.clusterName || welcomeClusterName));
    setActiveTab('chat');
  };

  const handleDeleteConversation = async (conversationId: string) => {
    const confirmed = window.confirm('确认删除这条 AI 诊断记录吗？删除后不可恢复。');
    if (!confirmed) {
      return;
    }

    await apiClient.delete<void>(replacePathParams(aiDiagnosisAPI.deleteConversation, { id: conversationId }));
    if (conversationId === currentConversationId) {
      setCurrentConversationId('');
      setMessages(createWelcomeMessage(welcomeClusterName));
    }
    await refreshHistory(conversationId === currentConversationId ? '' : currentConversationId);
    toast.success('诊断记录已删除');
  };

  const handleNewConversation = () => {
    setCurrentConversationId('');
    setMessages(createWelcomeMessage(welcomeClusterName));
    setActiveTab('chat');
    setInputMessage('');
  };

  const handleSendMessage = async () => {
    const nextMessage = inputMessage.trim();
    if (!nextMessage || sending) {
      return;
    }

    const optimisticUserMessage: AIConversationMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: nextMessage,
      createdAt: new Date().toISOString(),
    };
    const previousMessages = messages;

    setMessages((current) => [...current, optimisticUserMessage]);
    setInputMessage('');
    setSending(true);

    try {
      const response = await apiClient.post<AIChatResponse>(aiDiagnosisAPI.sendMessage, {
        conversationId: currentConversationId || undefined,
        message: nextMessage,
        clusterId: selectedClusterId || undefined,
      });

      setCurrentConversationId(response.conversation.id);
      setClusterStatus(response.cluster);
      setMessages(
        response.conversation.messages?.length
          ? response.conversation.messages
          : previousMessages,
      );
      await refreshHistory(response.conversation.id);
    } catch (error) {
      setMessages(previousMessages);
      return;
    } finally {
      setSending(false);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)}></div>
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.28 }}
            className={`relative h-full w-64 shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <Server className="text-blue-500" />
                <h2 className="text-xl font-bold">K8s Agent</h2>
              </div>
              <button onClick={() => setSidebarOpen(false)} className={`rounded-lg p-1 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1 p-4">
              {navItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
              {navItem(<Server size={20} />, '节点', '/nodes')}
              {navItem(<Database size={20} />, 'Pods', '/pods')}
              {navItem(<Network size={20} />, '工作负载', '/workloads')}
              {navItem(<Settings size={20} />, '设置', '/settings')}
              {navItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
            </div>
          </motion.div>
        </div>
      )}

      <div className={`fixed inset-y-0 left-0 hidden w-64 border-r lg:flex lg:flex-col ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className={`flex items-center gap-2 border-b p-4 ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          <Server className="text-blue-500" />
          <h2 className="text-xl font-bold">K8s Agent</h2>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-4">
          {navItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
          {navItem(<Server size={20} />, '节点', '/nodes')}
          {navItem(<Database size={20} />, 'Pods', '/pods')}
          {navItem(<Network size={20} />, '工作负载', '/workloads')}
          {navItem(<Settings size={20} />, '设置', '/settings')}
          {navItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
        </div>
        <div className={`border-t p-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                <User size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">管理员</div>
                <div className="text-xs opacity-70">admin@k8s-agent.com</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className={`rounded-full p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              aria-label="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="lg:ml-64 flex min-h-screen flex-col">
        <header className={`sticky top-0 z-40 border-b ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          <div className="grid gap-3 px-4 py-3 md:px-6 md:py-4 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
            <div className="flex min-w-0 items-start gap-4 xl:col-start-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className={`mt-1 rounded-lg p-2 lg:hidden ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <Menu size={20} />
              </button>
              <div className="flex min-w-0 items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${isDark ? 'border-blue-800/60 bg-blue-900/40' : 'border-blue-200 bg-blue-50'}`}>
                  <Brain className="text-blue-500" size={24} />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold md:text-2xl">AI 诊断助手</h1>
                  <p className={`mt-1 hidden text-sm 2xl:block ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    结合真实集群状态、大模型推理与历史会话，输出诊断结论、风险判断和下一步建议。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 xl:col-start-2 xl:justify-end">
              <button
                onClick={toggleTheme}
                className={`rounded-full p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationCenter />
            </div>
            <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 xl:col-start-3 xl:row-start-1 xl:min-w-0 ${isDark ? 'border-gray-700 bg-gray-800/70' : 'border-gray-200 bg-gray-50'}`}>
              <div className="min-w-0 xl:max-w-[220px]">
                <div className="text-sm opacity-70">当前分析集群</div>
                <div className="mt-1 truncate text-xl font-bold md:text-2xl">{welcomeClusterName}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${connectionMeta.badgeClass}`}>
                    {connectionMeta.label}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    {clusterStatus?.source === 'live' ? '真实集群' : '快照上下文'}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    更新时间: {clusterStatus ? formatConversationTime(clusterStatus.generatedAt) : '--'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <ClusterSelector
                  theme={theme}
                  clusters={enabledClusters}
                  value={selectedClusterId}
                  loading={clusterLoading}
                  onChange={setSelectedClusterId}
                />
                <button
                  onClick={() => void refreshClusterStatus()}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
                    isDark ? 'border-gray-600 bg-gray-700 text-white hover:bg-gray-600' : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <RefreshCw size={16} className={refreshingCluster ? 'animate-spin' : ''} />
                  刷新诊断上下文
                </button>
                <button
                  onClick={handleNewConversation}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <PlusCircle size={16} />
                  新建会话
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 xl:min-h-0">
          <section className="hidden">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-sm opacity-70">当前分析集群</div>
                <div className="mt-1 text-2xl font-bold">{welcomeClusterName}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${connectionMeta.badgeClass}`}>
                    {connectionMeta.label}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    {clusterStatus?.source === 'live' ? '真实集群' : '快照上下文'}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    更新时间：{clusterStatus ? formatConversationTime(clusterStatus.generatedAt) : '--'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <ClusterSelector
                  theme={theme}
                  clusters={enabledClusters}
                  value={selectedClusterId}
                  loading={clusterLoading}
                  onChange={setSelectedClusterId}
                />
                <button
                  onClick={() => void refreshClusterStatus()}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
                    isDark ? 'border-gray-600 bg-gray-700 text-white hover:bg-gray-600' : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <RefreshCw size={16} className={refreshingCluster ? 'animate-spin' : ''} />
                  刷新诊断上下文
                </button>
                <button
                  onClick={handleNewConversation}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <PlusCircle size={16} />
                  新建会话
                </button>
              </div>
            </div>

          </section>

          <section
            className={`overflow-hidden rounded-2xl border shadow-sm ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} xl:min-h-0 xl:flex-1`}
          >
            <div className={`flex border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 px-4 py-3 text-sm font-medium ${
                  activeTab === 'chat'
                    ? isDark
                      ? 'border-b-2 border-blue-500 bg-gray-900 text-white'
                      : 'border-b-2 border-blue-500 bg-blue-50 text-blue-600'
                    : isDark
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <MessageCircle size={16} className="mr-1 inline-block" />
                聊天
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-4 py-3 text-sm font-medium ${
                  activeTab === 'history'
                    ? isDark
                      ? 'border-b-2 border-blue-500 bg-gray-900 text-white'
                      : 'border-b-2 border-blue-500 bg-blue-50 text-blue-600'
                    : isDark
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <History size={16} className="mr-1 inline-block" />
                诊断历史
              </button>
            </div>

            {loading ? (
              <div className="grid gap-6 p-5 xl:h-full xl:grid-cols-[2fr,1fr]">
                <div className={`h-[520px] animate-pulse rounded-xl ${isDark ? 'bg-gray-900/50' : 'bg-gray-100'}`}></div>
                <div className={`h-[520px] animate-pulse rounded-xl ${isDark ? 'bg-gray-900/50' : 'bg-gray-100'}`}></div>
              </div>
            ) : activeTab === 'chat' ? (
              <div className="grid gap-6 p-5 xl:h-full xl:grid-cols-[2fr,1fr] xl:items-stretch">
                <div
                  className={`flex min-h-[540px] flex-col overflow-hidden rounded-xl border ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'} xl:min-h-0 xl:h-full`}
                >
                  <div className={`shrink-0 flex items-center justify-between border-b px-4 py-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                      <div className="font-semibold">诊断对话</div>
                      <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {currentConversation ? `会话标题：${currentConversation.title}` : '新会话将结合当前集群上下文进行分析'}
                      </div>
                    </div>
                    {currentConversation && (
                      <button
                        onClick={handleNewConversation}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      >
                        回到新会话
                      </button>
                    )}
                  </div>

                  <div ref={messagesContainerRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className={`mb-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {message.role === 'user' ? '你' : 'AI 助手'} · {formatConversationTime(message.createdAt)}
                          </div>
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                              message.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : isDark
                                  ? 'bg-gray-700 text-white'
                                  : 'bg-white text-gray-900'
                            }`}
                          >
                            <pre className="whitespace-pre-wrap break-words font-sans">{message.content}</pre>
                          </div>
                        </div>
                      </div>
                    ))}

                    {sending && (
                      <div className="flex justify-start">
                        <div className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-gray-700' : 'bg-white'} shadow-sm`}>
                          <div className="flex items-center gap-2 text-sm">
                            <RefreshCw size={14} className="animate-spin" />
                            正在结合集群上下文生成诊断结果...
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef}></div>
                  </div>

                  <div className={`shrink-0 border-t p-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="relative">
                      <textarea
                        value={inputMessage}
                        onChange={(event) => setInputMessage(event.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="请输入你的问题，例如：为什么 openebs 的工作负载一直不稳定？当前是否存在需要优先处理的风险？"
                        className={`h-28 w-full resize-none rounded-xl border px-4 py-3 pr-14 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                        }`}
                      />
                      <button
                        onClick={() => void handleSendMessage()}
                        disabled={!inputMessage.trim() || sending}
                        className={`absolute bottom-3 right-3 rounded-full p-2 text-white ${
                          !inputMessage.trim() || sending ? 'cursor-not-allowed bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                        aria-label="发送消息"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggestionPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setInputMessage(prompt)}
                          className={`rounded-full px-3 py-1 text-xs ${
                            isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto">
                  <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">优先关注节点</div>
                      <Server size={16} className="text-blue-500" />
                    </div>
                    <div className="mt-3 space-y-3">
                      {clusterStatus?.nodeHighlights.length ? (
                        clusterStatus.nodeHighlights.map((node) => (
                          <div key={node.name} className={`rounded-lg border p-3 text-sm ${isDark ? 'border-gray-700 bg-gray-800/70' : 'border-gray-200 bg-white'}`}>
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{node.name}</div>
                              <span className={`rounded-full px-2 py-0.5 text-xs ${
                                node.status === 'offline'
                                  ? isDark
                                    ? 'bg-rose-500/15 text-rose-300'
                                    : 'bg-rose-50 text-rose-600'
                                  : isDark
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-emerald-50 text-emerald-600'
                              }`}>
                                {node.status}
                              </span>
                            </div>
                            <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              <span>CPU {node.cpuUsage}%</span>
                              <span>内存 {node.memoryUsage}%</span>
                              <span>Pods {node.pods}</span>
                              <span>{node.schedulable ? '可调度' : '不可调度'}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                          暂无需要重点关注的节点。
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">问题 Pods</div>
                      <Database size={16} className="text-amber-500" />
                    </div>
                    <div className="mt-3 space-y-3">
                      {clusterStatus?.problemPods.length ? (
                        clusterStatus.problemPods.map((pod) => (
                          <div key={`${pod.namespace}/${pod.name}`} className={`rounded-lg border p-3 text-sm ${isDark ? 'border-gray-700 bg-gray-800/70' : 'border-gray-200 bg-white'}`}>
                            <div className="font-medium">{pod.name}</div>
                            <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {pod.namespace} · {pod.status}
                            </div>
                            <div className={`mt-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>节点：{pod.node || '--'}</div>
                          </div>
                        ))
                      ) : (
                        <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                          当前没有异常状态的 Pods。
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">工作负载告警</div>
                      <Package size={16} className="text-purple-500" />
                    </div>
                    <div className="mt-3 space-y-3">
                      {clusterStatus?.workloadAlerts.length ? (
                        clusterStatus.workloadAlerts.map((item) => (
                          <div key={`${item.scope}/${item.namespace}/${item.name}`} className={`rounded-lg border p-3 text-sm ${isDark ? 'border-gray-700 bg-gray-800/70' : 'border-gray-200 bg-white'}`}>
                            <div className="font-medium">{item.name}</div>
                            <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {item.namespace} · {item.scope}
                            </div>
                            <div className={`mt-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              Ready {item.ready}/{item.desired} · Available {item.available}
                              {item.paused ? ' · 已暂停' : ''}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                          当前没有待处理的工作负载异常。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 p-5 xl:h-full xl:grid-cols-[1.3fr,1fr]">
                <div className="space-y-4 xl:min-h-0 xl:overflow-y-auto">
                  {conversations.length === 0 ? (
                    <div className={`rounded-xl border border-dashed p-8 text-center ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                      还没有 AI 诊断历史。发起第一条诊断问题后，会话会自动保存在这里。
                    </div>
                  ) : (
                    conversations.map((conversation) => (
                      <motion.div
                        key={conversation.id}
                        whileHover={{ y: -2 }}
                        className={`cursor-pointer rounded-xl border p-4 shadow-sm transition-all ${
                          currentConversationId === conversation.id
                            ? isDark
                              ? 'border-blue-700 bg-blue-900/20'
                              : 'border-blue-200 bg-blue-50'
                            : isDark
                              ? 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        onClick={() => void loadConversation(conversation.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{conversation.title}</div>
                            <div className={`mt-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                              {conversation.summary}
                            </div>
                            <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              <span className="inline-flex items-center gap-1">
                                <Clock size={12} />
                                {formatConversationTime(conversation.updatedAt)}
                              </span>
                              {conversation.clusterName && (
                                <span className={`rounded-full px-2 py-0.5 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                  {conversation.clusterName}
                                </span>
                              )}
                              {conversation.modelName && (
                                <span className={`rounded-full px-2 py-0.5 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                  {conversation.modelName}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteConversation(conversation.id);
                            }}
                            className={`rounded-full p-2 ${isDark ? 'text-rose-300 hover:bg-gray-700' : 'text-rose-500 hover:bg-gray-100'}`}
                            aria-label="删除会话"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'} xl:min-h-0 xl:overflow-y-auto`}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">历史说明</div>
                    <History size={16} className="text-blue-500" />
                  </div>
                  <div className={`mt-4 space-y-4 text-sm leading-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <p>AI 诊断历史会记录每次提问的主题、摘要、关联集群和使用模型，便于后续回溯。</p>
                    <p>点击任意一条历史记录，会把完整对话重新加载回聊天区，继续追问时会保留上下文。</p>
                    <p>如果切换了分析集群，建议新建会话，这样历史和诊断上下文会更清晰。</p>
                    {currentConversation && (
                      <div className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-800/70 text-gray-200' : 'border-gray-200 bg-white text-gray-700'}`}>
                        <div className="font-medium">{currentConversation.title}</div>
                        <div className="mt-2 text-xs opacity-80">最近更新：{formatConversationTime(currentConversation.updatedAt)}</div>
                        <div className="mt-1 text-xs opacity-80">会话摘要：{currentConversation.summary}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
