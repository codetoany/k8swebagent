import { type KeyboardEvent, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Brain,
  Clock,
  Database,
  FileText,
  History,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Package,
  PlusCircle,
  RefreshCw,
  Send,
  Server,
  Settings,
  ShieldAlert,
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
import apiClient, { buildApiUrl } from '@/lib/apiClient';
import { aiDiagnosisAPI, replacePathParams } from '@/lib/api';
import ClusterSelector from '@/components/ClusterSelector';
import NotificationCenter from '@/components/NotificationCenter';

type ConversationRole = 'user' | 'assistant';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type ActionPriority = 'p1' | 'p2' | 'p3';

interface AITargetRef {
  kind: 'node' | 'pod' | 'workload';
  scope?: string;
  namespace?: string;
  name: string;
  route?: string;
  label: string;
}

interface AIDiagnosisEvidence {
  id: string;
  type: 'event' | 'metric' | 'log' | 'status';
  severity: Severity;
  title: string;
  summary: string;
  timestamp?: string;
  target?: AITargetRef | null;
  snippets?: string[];
}

interface AIDiagnosisFinding {
  title: string;
  detail: string;
  severity: Severity;
  evidenceIds?: string[];
}

interface AIDiagnosisAction {
  title: string;
  description: string;
  priority: ActionPriority;
  actionType: 'inspect' | 'follow-up' | 'observe';
  commandHint?: string;
  risk?: string;
  target?: AITargetRef | null;
}

interface AIDiagnosisReport {
  title: string;
  summary: string;
  conclusion: string;
  riskLevel: RiskLevel;
  findings: AIDiagnosisFinding[];
  actions: AIDiagnosisAction[];
  evidence: AIDiagnosisEvidence[];
}

interface AIDiagnosisTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  prompt: string;
}

interface AIMessageMetadata {
  templateId?: string;
  report?: AIDiagnosisReport;
}

interface AIConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  metadata?: AIMessageMetadata | null;
  createdAt: string;
  streaming?: boolean;
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

interface AIClusterEventSummary {
  id: string;
  type: string;
  reason: string;
  message: string;
  timestamp: string;
  involvedObject?: {
    kind: string;
    name: string;
    namespace?: string;
  };
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
  recentEvents?: AIClusterEventSummary[];
  generatedAt: string;
}

interface AIChatResponse {
  conversation: AIConversation;
  cluster: AIClusterStatus;
  report?: AIDiagnosisReport;
}

interface AIDiagnosisStreamDone {
  conversation: AIConversation;
  cluster: AIClusterStatus;
  report?: AIDiagnosisReport;
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
      content: `你好，我是 K8s Agent AI 诊断助手。当前分析集群：${displayClusterName}。\n\n你可以直接问我：\n1. 集群现在是否健康\n2. 哪些节点或 Pod 需要优先关注\n3. 资源是否存在浪费或瓶颈\n4. 某个工作负载为什么不稳定\n\n我会结合当前集群上下文，给出结论、风险判断、证据链和下一步建议。`,
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

function getRiskMeta(level: RiskLevel, theme: 'light' | 'dark') {
  const palette =
    theme === 'dark'
      ? {
          critical: 'bg-rose-500/20 text-rose-200 border border-rose-500/30',
          high: 'bg-orange-500/20 text-orange-200 border border-orange-500/30',
          medium: 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
          low: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
        }
      : {
          critical: 'bg-rose-50 text-rose-700 border border-rose-200',
          high: 'bg-orange-50 text-orange-700 border border-orange-200',
          medium: 'bg-amber-50 text-amber-700 border border-amber-200',
          low: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        };

  const labelMap: Record<RiskLevel, string> = {
    critical: '高危',
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  };

  return {
    label: labelMap[level] || '未知',
    className: palette[level] || palette.low,
  };
}

function getSeverityMeta(level: Severity, theme: 'light' | 'dark') {
  return getRiskMeta(level, theme);
}

function getPriorityMeta(priority: ActionPriority, theme: 'light' | 'dark') {
  const palette =
    theme === 'dark'
      ? {
          p1: 'bg-rose-500/20 text-rose-200 border border-rose-500/30',
          p2: 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
          p3: 'bg-slate-500/20 text-slate-200 border border-slate-500/30',
        }
      : {
          p1: 'bg-rose-50 text-rose-700 border border-rose-200',
          p2: 'bg-amber-50 text-amber-700 border border-amber-200',
          p3: 'bg-slate-100 text-slate-700 border border-slate-200',
        };

  const labelMap: Record<ActionPriority, string> = {
    p1: 'P1',
    p2: 'P2',
    p3: 'P3',
  };

  return {
    label: labelMap[priority] || 'P3',
    className: palette[priority] || palette.p3,
  };
}

function mapTargetLabel(target?: AITargetRef | null) {
  if (!target) {
    return '';
  }
  if (target.label) {
    return target.label;
  }
  if (target.namespace) {
    return `${target.namespace}/${target.name}`;
  }
  return target.name;
}

function buildAuthHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('authToken');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseSSEBlocks(buffer: string) {
  const blocks = buffer.split('\n\n');
  const remaining = blocks.pop() ?? '';
  const events = blocks
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      let event = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      const rawData = dataLines.join('\n');
      if (!rawData) {
        return null;
      }

      try {
        return {
          event,
          data: JSON.parse(rawData) as unknown,
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is { event: string; data: unknown } => item !== null);

  return { events, remaining };
}

async function streamDiagnosisMessage(
  payload: { conversationId?: string; clusterId?: string; message: string; templateId?: string },
  onDelta: (delta: string) => void,
): Promise<AIDiagnosisStreamDone> {
  const params = payload.clusterId ? { clusterId: payload.clusterId } : undefined;
  const response = await fetch(buildApiUrl(aiDiagnosisAPI.streamMessage, params), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: `请求失败: ${response.status}` }));
    throw new Error((errorData as { message?: string }).message || `请求失败: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload: AIDiagnosisStreamDone | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSSEBlocks(buffer);
    buffer = parsed.remaining;

    for (const event of parsed.events) {
      if (event.event === 'delta') {
        const delta = (event.data as { content?: string }).content || '';
        if (delta) {
          onDelta(delta);
        }
      } else if (event.event === 'error') {
        const message = (event.data as { message?: string }).message || '流式输出失败';
        throw new Error(message);
      } else if (event.event === 'done') {
        donePayload = event.data as AIDiagnosisStreamDone;
      }
    }
  }

  if (!donePayload) {
    throw new Error('流式响应未返回最终结果');
  }

  return donePayload;
}

function ReportCard({
  report,
  isDark,
  onOpenTarget,
}: {
  report: AIDiagnosisReport;
  isDark: boolean;
  onOpenTarget: (target: AITargetRef | undefined | null) => void;
}) {
  const riskMeta = getRiskMeta(report.riskLevel, isDark ? 'dark' : 'light');

  return (
    <div className={`mt-4 rounded-2xl border ${isDark ? 'border-gray-600 bg-gray-800/80' : 'border-gray-200 bg-gray-50'} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{report.title}</div>
          <div className={`mt-1 text-xs leading-5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{report.summary}</div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${riskMeta.className}`}>
          {riskMeta.label}
        </span>
      </div>

      <div className={`mt-4 rounded-xl border px-3 py-3 ${isDark ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert size={15} className="text-rose-500" />
          结论
        </div>
        <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{report.conclusion}</p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className={`rounded-xl border p-3 ${isDark ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle size={15} className="text-amber-500" />
            关键发现
          </div>
          <div className="mt-3 space-y-3">
            {report.findings.length === 0 ? (
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>当前没有补充发现。</div>
            ) : (
              report.findings.map((item, index) => {
                const severityMeta = getSeverityMeta(item.severity, isDark ? 'dark' : 'light');
                return (
                  <div key={`${item.title}-${index}`} className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{item.title}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severityMeta.className}`}>{severityMeta.label}</span>
                    </div>
                    <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{item.detail}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={`rounded-xl border p-3 ${isDark ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText size={15} className="text-blue-500" />
            建议动作
          </div>
          <div className="mt-3 space-y-3">
            {report.actions.length === 0 ? (
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>当前没有可执行的下一步建议。</div>
            ) : (
              report.actions.map((item, index) => {
                const priorityMeta = getPriorityMeta(item.priority, isDark ? 'dark' : 'light');
                return (
                  <div key={`${item.title}-${index}`} className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{item.title}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityMeta.className}`}>{priorityMeta.label}</span>
                    </div>
                    <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{item.description}</p>
                    {item.target && (
                      <button
                        type="button"
                        onClick={() => onOpenTarget(item.target)}
                        className={`mt-3 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                          isDark ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        查看 {mapTargetLabel(item.target)}
                        <ArrowRight size={13} />
                      </button>
                    )}
                    {item.commandHint && (
                      <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${isDark ? 'bg-gray-900 text-gray-300' : 'bg-white text-gray-600'}`}>
                        {item.commandHint}
                      </div>
                    )}
                    {item.risk && <div className={`mt-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>风险提示：{item.risk}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border p-3 ${isDark ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database size={15} className="text-emerald-500" />
          证据链
        </div>
        <div className="mt-3 space-y-3">
          {report.evidence.length === 0 ? (
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>当前没有可展示的诊断证据。</div>
          ) : (
            report.evidence.map((item) => {
              const severityMeta = getSeverityMeta(item.severity, isDark ? 'dark' : 'light');
              return (
                <div key={item.id} className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severityMeta.className}`}>{severityMeta.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'}`}>{item.type}</span>
                    </div>
                  </div>
                  <div className={`mt-2 text-sm leading-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{item.summary}</div>
                  {item.target && (
                    <button
                      type="button"
                      onClick={() => onOpenTarget(item.target)}
                      className={`mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                        isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      跳转到 {mapTargetLabel(item.target)}
                      <ArrowRight size={13} />
                    </button>
                  )}
                  {!!item.snippets?.length && (
                    <div className={`mt-3 space-y-2 rounded-lg px-3 py-3 text-xs ${isDark ? 'bg-gray-900 text-gray-300' : 'bg-white text-gray-600'}`}>
                      {item.snippets.map((snippet, index) => (
                        <div key={`${item.id}-snippet-${index}`} className="leading-5">
                          {snippet}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.timestamp && <div className={`mt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>时间：{formatConversationTime(item.timestamp)}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
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
  const [templates, setTemplates] = useState<AIDiagnosisTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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
    const composer = composerRef.current;
    if (!composer) {
      return;
    }
    composer.style.height = '0px';
    const nextHeight = Math.min(Math.max(composer.scrollHeight, 72), 220);
    composer.style.height = `${nextHeight}px`;
  }, [inputMessage]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setCurrentConversationId('');
      setMessages(createWelcomeMessage(selectedCluster?.name || '默认诊断上下文'));

      try {
        const [templateList, history, status] = await Promise.all([
          apiClient.get<AIDiagnosisTemplate[]>(aiDiagnosisAPI.getTemplates),
          apiClient.get<AIConversation[]>(aiDiagnosisAPI.getDiagnosisHistory, selectedClusterId ? { clusterId: selectedClusterId } : undefined),
          apiClient.get<AIClusterStatus>(aiDiagnosisAPI.getNodeStatus, selectedClusterId ? { clusterId: selectedClusterId } : undefined),
        ]);

        if (cancelled) {
          return;
        }

        setTemplates(Array.isArray(templateList) ? templateList : []);
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

  const openTarget = (target?: AITargetRef | null) => {
    if (!target?.route) {
      return;
    }
    navigate(target.route);
  };

  const navItem = (icon: ReactNode, label: string, path: string) => {
    const active = location.pathname === path;
    return (
      <motion.div
        whileHover={{ x: 4 }}
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

  const refreshHistory = async (preferredConversationId?: string) => {
    const history = await apiClient.get<AIConversation[]>(
      aiDiagnosisAPI.getDiagnosisHistory,
      selectedClusterId ? { clusterId: selectedClusterId } : undefined,
    );
    setConversations(history);
    if (preferredConversationId !== undefined) {
      if (preferredConversationId && history.some((item) => item.id === preferredConversationId)) {
        setCurrentConversationId(preferredConversationId);
      } else if (!preferredConversationId) {
        setCurrentConversationId('');
      }
    }
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

  const loadConversation = async (conversationId: string) => {
    const detail = await apiClient.get<AIConversation>(replacePathParams(aiDiagnosisAPI.getConversationDetail, { id: conversationId }));
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

  const handleSelectTemplate = (template: AIDiagnosisTemplate) => {
    setActiveTemplateId(template.id);
    setInputMessage(template.prompt);
    setActiveTab('chat');
    composerRef.current?.focus();
  };

  const applyConversationResponse = async (response: AIChatResponse) => {
    setCurrentConversationId(response.conversation.id);
    setClusterStatus(response.cluster);
    setMessages(
      response.conversation.messages?.length
        ? response.conversation.messages
        : createWelcomeMessage(response.cluster.clusterName || welcomeClusterName),
    );
    await refreshHistory(response.conversation.id);
  };

  const handleSendMessage = async () => {
    const nextMessage = inputMessage.trim();
    if (!nextMessage || sending) {
      return;
    }

    const previousMessages = messages;
    const now = new Date().toISOString();
    const userMessage: AIConversationMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: nextMessage,
      createdAt: now,
    };
    const placeholderId = `local-assistant-stream-${Date.now()}`;
    const placeholderMessage: AIConversationMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      metadata: activeTemplateId ? { templateId: activeTemplateId } : undefined,
      createdAt: now,
      streaming: true,
    };

    setMessages((current) => [...current, userMessage, placeholderMessage]);
    setInputMessage('');
    setSending(true);

    const payload = {
      conversationId: currentConversationId || undefined,
      clusterId: selectedClusterId || undefined,
      message: nextMessage,
      templateId: activeTemplateId || undefined,
    };

    try {
      const streamed = await streamDiagnosisMessage(payload, (delta) => {
        setMessages((current) =>
          current.map((item) =>
            item.id === placeholderId
              ? {
                  ...item,
                  content: item.content + delta,
                }
              : item,
          ),
        );
      });

      await applyConversationResponse(streamed);
    } catch {
      try {
        const fallback = await apiClient.post<AIChatResponse>(aiDiagnosisAPI.sendMessage, payload);
        await applyConversationResponse(fallback);
      } catch (fallbackError) {
        setMessages(previousMessages);
        throw fallbackError;
      }
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
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-300 lg:h-screen lg:overflow-hidden ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
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
            <div className={`flex items-center justify-between border-b px-4 py-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <Brain size={20} className="text-blue-500" />
                <span className="text-lg font-bold">K8s Agent</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 p-4">
              {navItem(<BarChart3 />, '仪表盘', '/dashboard')}
              {navItem(<Server />, '节点', '/nodes')}
              {navItem(<Database />, 'Pods', '/pods')}
              {navItem(<Package />, '工作负载', '/workloads')}
              {navItem(<Settings />, '设置', '/settings')}
              {navItem(<AlertCircle />, 'AI 诊断', '/ai-diagnosis')}
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex h-full min-h-screen">
        <aside className={`hidden w-72 shrink-0 border-r lg:flex lg:flex-col ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          <div className={`flex h-20 items-center border-b px-6 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <Brain size={22} className="text-blue-500" />
              <span className="text-2xl font-bold">K8s Agent</span>
            </div>
          </div>

          <div className="flex-1 space-y-2 px-4 py-6">
            {navItem(<BarChart3 />, '仪表盘', '/dashboard')}
            {navItem(<Server />, '节点', '/nodes')}
            {navItem(<Database />, 'Pods', '/pods')}
            {navItem(<Package />, '工作负载', '/workloads')}
            {navItem(<Settings />, '设置', '/settings')}
            {navItem(<AlertCircle />, 'AI 诊断', '/ai-diagnosis')}
          </div>

          <div className={`border-t px-4 py-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-2 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <User size={18} />
                </div>
                <div>
                  <div className="font-semibold">管理员</div>
                  <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>admin@k8s-agent.com</div>
                </div>
              </div>
              <button onClick={handleLogout} className={`rounded-lg p-2 ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>

        <main className="flex min-h-screen min-w-0 flex-1 flex-col lg:h-screen">
          <header className={`shrink-0 border-b px-4 py-4 sm:px-6 ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button onClick={() => setSidebarOpen(true)} className={`rounded-lg p-2 lg:hidden ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                  <Menu size={18} />
                </button>
                <div className={`hidden rounded-xl p-2 sm:block ${isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                  <Brain size={22} />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold">AI 诊断助手</h1>
                  <p className={`hidden text-sm xl:block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    结合真实集群状态、大模型推理与证据链，输出诊断结论、风险判断和下一步建议。
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    集群 {clusterStatus?.clusterName || welcomeClusterName}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${connectionMeta.badgeClass}`}>{connectionMeta.label}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    {clusterStatus?.source === 'live' ? '真实集群' : '快照上下文'}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    {clusterStatus ? formatConversationTime(clusterStatus.generatedAt) : '--'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <ClusterSelector theme={theme} clusters={enabledClusters} value={selectedClusterId} loading={clusterLoading} onChange={setSelectedClusterId} />
                  <button
                    onClick={() => void refreshClusterStatus()}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${isDark ? 'border-gray-600 bg-gray-800 text-white hover:bg-gray-700' : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    <RefreshCw size={15} className={refreshingCluster ? 'animate-spin' : ''} />
                    刷新诊断上下文
                  </button>
                  <button onClick={handleNewConversation} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    <PlusCircle size={15} />
                    新建会话
                  </button>
                  <button onClick={toggleTheme} className={`rounded-lg p-2 ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`} aria-label="切换主题">
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
                  <NotificationCenter isDark={isDark} />
                </div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
            <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border shadow-sm ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <div className={`flex shrink-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
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
                <div className="grid min-h-0 flex-1 gap-6 p-5 xl:grid-cols-[minmax(0,2fr)_360px]">
                  <div className={`h-full min-h-[520px] animate-pulse rounded-xl ${isDark ? 'bg-gray-900/50' : 'bg-gray-100'}`}></div>
                  <div className={`h-full min-h-[520px] animate-pulse rounded-xl ${isDark ? 'bg-gray-900/50' : 'bg-gray-100'}`}></div>
                </div>
              ) : activeTab === 'chat' ? (
                <div className="grid min-h-0 flex-1 gap-6 p-5 xl:grid-cols-[minmax(0,2fr)_360px]">
                  <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className={`shrink-0 border-b px-4 py-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">诊断对话</div>
                          <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
                    </div>

                    <div ref={messagesContainerRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
                      {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[92%] ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className={`mb-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {message.role === 'user' ? '你' : 'AI 助手'} · {formatConversationTime(message.createdAt)}
                              {message.streaming ? ' · 正在生成' : ''}
                            </div>
                            <div className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === 'user' ? 'bg-blue-600 text-white' : isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}>
                              <pre className="whitespace-pre-wrap break-words font-sans">{message.content || '正在生成内容...'}</pre>
                            </div>
                            {message.role === 'assistant' && message.metadata?.report && (
                              <ReportCard report={message.metadata.report} isDark={isDark} onOpenTarget={openTarget} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className={`shrink-0 border-t p-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className="grid gap-3">
                        <div className="flex flex-wrap gap-2">
                          {templates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => handleSelectTemplate(template)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                activeTemplateId === template.id
                                  ? 'bg-blue-600 text-white'
                                  : isDark
                                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {template.title}
                            </button>
                          ))}
                        </div>

                        {activeTemplateId && (
                          <div className={`rounded-xl border px-3 py-3 text-sm ${isDark ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                            {templates.find((item) => item.id === activeTemplateId)?.description}
                          </div>
                        )}

                        <div className="relative">
                          <textarea
                            ref={composerRef}
                            value={inputMessage}
                            onChange={(event) => setInputMessage(event.target.value)}
                            onKeyDown={handleInputKeyDown}
                            placeholder="请输入你的问题，例如：为什么 openebs 的工作负载一直不稳定？当前是否存在需要优先处理的风险？"
                            className={`min-h-[72px] max-h-[220px] w-full resize-none overflow-y-auto rounded-xl border px-4 py-3 pr-14 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                          />
                          <button
                            onClick={() => void handleSendMessage()}
                            disabled={!inputMessage.trim() || sending}
                            className={`absolute bottom-3 right-3 rounded-full p-2 text-white ${!inputMessage.trim() || sending ? 'cursor-not-allowed bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                            aria-label="发送消息"
                          >
                            <Send size={18} />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {suggestionPrompts.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => {
                                setActiveTemplateId('');
                                setInputMessage(prompt);
                              }}
                              className={`rounded-full px-3 py-1 text-xs ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 space-y-4 overflow-y-auto">
                    <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">优先关注节点</div>
                        <Server size={16} className="text-blue-500" />
                      </div>
                      <div className="mt-3 space-y-3">
                        {clusterStatus?.nodeHighlights.length ? (
                          clusterStatus.nodeHighlights.map((node) => (
                            <button
                              key={node.name}
                              type="button"
                              onClick={() => openTarget({ kind: 'node', name: node.name, label: node.name, route: `/nodes?name=${node.name}` })}
                              className={`w-full rounded-lg border p-3 text-left text-sm ${isDark ? 'border-gray-700 bg-gray-800/70 hover:border-blue-500/40' : 'border-gray-200 bg-white hover:border-blue-200'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium">{node.name}</div>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${node.status === 'offline' ? (isDark ? 'bg-rose-500/15 text-rose-300' : 'bg-rose-50 text-rose-600') : (isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600')}`}>
                                  {node.status}
                                </span>
                              </div>
                              <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <span>CPU {node.cpuUsage}%</span>
                                <span>内存 {node.memoryUsage}%</span>
                                <span>Pods {node.pods}</span>
                                <span>{node.schedulable ? '可调度' : '不可调度'}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>暂无需要重点关注的节点。</div>
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
                            <button
                              key={`${pod.namespace}/${pod.name}`}
                              type="button"
                              onClick={() => openTarget({ kind: 'pod', namespace: pod.namespace, name: pod.name, label: `${pod.namespace}/${pod.name}`, route: `/pods?namespace=${pod.namespace}&name=${pod.name}` })}
                              className={`w-full rounded-lg border p-3 text-left text-sm ${isDark ? 'border-gray-700 bg-gray-800/70 hover:border-blue-500/40' : 'border-gray-200 bg-white hover:border-blue-200'}`}
                            >
                              <div className="font-medium">{pod.name}</div>
                              <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{pod.namespace} · {pod.status}</div>
                              <div className={`mt-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>节点：{pod.node || '--'}</div>
                            </button>
                          ))
                        ) : (
                          <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>当前没有异常状态的 Pods。</div>
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
                          clusterStatus.workloadAlerts.map((item) => {
                            const scope = item.scope.replace(/s$/, '');
                            return (
                              <button
                                key={`${item.scope}/${item.namespace}/${item.name}`}
                                type="button"
                                onClick={() => openTarget({ kind: 'workload', scope, namespace: item.namespace, name: item.name, label: `${item.namespace}/${item.name}`, route: `/workloads?type=${scope}&namespace=${item.namespace}&name=${item.name}` })}
                                className={`w-full rounded-lg border p-3 text-left text-sm ${isDark ? 'border-gray-700 bg-gray-800/70 hover:border-blue-500/40' : 'border-gray-200 bg-white hover:border-blue-200'}`}
                              >
                                <div className="font-medium">{item.name}</div>
                                <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.namespace} · {scope}</div>
                                <div className={`mt-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                  Ready {item.ready}/{item.desired} · Available {item.available}
                                  {item.paused ? ' · 已暂停' : ''}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>当前没有待处理的工作负载异常。</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 gap-6 p-5 xl:grid-cols-[1.3fr,1fr]">
                  <div className="min-h-0 space-y-4 overflow-y-auto">
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
                              <div className={`mt-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{conversation.summary}</div>
                              <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={12} />
                                  {formatConversationTime(conversation.updatedAt)}
                                </span>
                                {conversation.clusterName && <span className={`rounded-full px-2 py-0.5 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{conversation.clusterName}</span>}
                                {conversation.modelName && <span className={`rounded-full px-2 py-0.5 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{conversation.modelName}</span>}
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

                  <div className={`overflow-y-auto rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">历史说明</div>
                      <History size={16} className="text-blue-500" />
                    </div>
                    <div className={`mt-4 space-y-4 text-sm leading-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <p>AI 诊断历史会记录每次提问的主题、摘要、关联集群、使用模型，以及结构化诊断结果，便于后续回溯。</p>
                      <p>点击任意一条历史记录，会把完整对话和诊断卡片重新加载回聊天区，继续追问时会保留上下文。</p>
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
          </div>
        </main>
      </div>
    </div>
  );
}
