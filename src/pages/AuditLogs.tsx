import { type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  Database,
  LogOut,
  Menu,
  Moon,
  Network,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/authContext';
import { useClusterContext } from '@/contexts/clusterContext';
import { useThemeContext } from '@/contexts/themeContext';
import { auditAPI } from '@/lib/api';
import apiClient from '@/lib/apiClient';
import {
  auditActionOptions,
  auditResourceTypeOptions,
  getAuditActionLabel,
  getAuditStatusMeta,
  type AuditLogEntry,
  type AuditLogListResponse,
} from '@/lib/audit';
import TablePagination from '@/components/TablePagination';
import NotificationCenter from '@/components/NotificationCenter';

function formatAuditTime(value: string) {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function AuditLogs() {
  const { theme, toggleTheme, isDark } = useThemeContext();
  const { clusters, selectedClusterId } = useClusterContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [query, setQuery] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');

  useEffect(() => {
    if (clusters.length === 0) {
      return;
    }

    setClusterFilter((current) => {
      if (current) {
        return current;
      }
      return selectedClusterId || '';
    });
  }, [clusters.length, selectedClusterId]);

  useEffect(() => {
    let active = true;

    const loadAuditLogs = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<AuditLogListResponse>(auditAPI.listAuditLogs, {
          page: currentPage,
          limit: pageSize,
          ...(clusterFilter ? { clusterId: clusterFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(actionFilter ? { action: actionFilter } : {}),
          ...(resourceTypeFilter ? { resourceType: resourceTypeFilter } : {}),
          ...(query.trim() ? { query: query.trim() } : {}),
        });

        if (!active) {
          return;
        }

        setAuditLogs(Array.isArray(response?.items) ? response.items : []);
        setTotal(response?.total ?? 0);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadAuditLogs();

    return () => {
      active = false;
    };
  }, [
    actionFilter,
    clusterFilter,
    currentPage,
    pageSize,
    query,
    refreshNonce,
    resourceTypeFilter,
    statusFilter,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, clusterFilter, pageSize, query, resourceTypeFilter, statusFilter]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.3 },
    },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.5,
        staggerChildren: 0.1,
      },
    },
  };

  const renderNavItem = (
    icon: ReactNode,
    label: string,
    path: string,
    active: boolean = false,
  ) => (
    <motion.div
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-300 ${
        active
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

  const clusterNameMap = useMemo(
    () =>
      new Map(
        clusters.map((cluster) => [
          cluster.id,
          cluster.name,
        ]),
      ),
    [clusters],
  );

  const selectedClusterLabel = clusterFilter
    ? clusterNameMap.get(clusterFilter) || clusterFilter
    : '全部集群';

  const successCount = auditLogs.filter((item) => item.status === 'success').length;
  const failedCount = auditLogs.filter((item) => item.status === 'failed').length;

  return (
    <div
      className={`min-h-screen flex ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
      } transition-colors duration-300`}
    >
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)}></div>
          <motion.div
            className={`fixed top-0 left-0 h-full w-64 ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            } shadow-lg`}
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
              {renderNavItem(<Shield size={20} />, '操作审计', '/audit-logs', true)}
              {renderNavItem(<Settings size={20} />, '设置', '/settings')}
              {renderNavItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
            </div>
          </motion.div>
        </div>
      )}

      <div
        className={`hidden lg:flex lg:flex-col w-64 ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        } border-r ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} h-screen fixed`}
      >
        <div className="p-4 border-b border-gray-700 flex items-center space-x-2">
          <Server className="text-blue-500" />
          <h2 className="text-xl font-bold">K8s Agent</h2>
        </div>
        <div className="p-4 space-y-1 flex-1 overflow-y-auto">
          {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
          {renderNavItem(<Server size={20} />, '节点', '/nodes')}
          {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
          {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
          {renderNavItem(<Shield size={20} />, '操作审计', '/audit-logs', true)}
          {renderNavItem(<Settings size={20} />, '设置', '/settings')}
          {renderNavItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
        </div>
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`w-8 h-8 rounded-full ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                } flex items-center justify-center`}
              >
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

      <div className="flex-1 lg:ml-64">
        <header
          className={`sticky top-0 z-40 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          } border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-gray-700"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-xl font-bold">操作审计</h1>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationCenter />
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
            <motion.div
              variants={itemVariants}
              className={`rounded-xl border p-5 shadow-sm ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'
              }`}
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-bold mb-1">集群操作审计</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    独立查看集群接入、设置变更以及节点、Pod、工作负载的真实写操作记录。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={clusterFilter}
                    onChange={(event) => setClusterFilter(event.target.value)}
                    className={`min-w-[220px] rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                      theme === 'dark'
                        ? 'border-gray-600 bg-gray-700 text-white'
                        : 'border-gray-200 bg-white text-gray-900'
                    }`}
                  >
                    <option value="">全部集群</option>
                    {clusters.map((cluster) => (
                      <option key={cluster.id} value={cluster.id}>
                        {cluster.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setRefreshNonce((value) => value + 1)}
                    className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
                      theme === 'dark'
                        ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                    刷新日志
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>当前集群过滤</div>
                  <div className="mt-2 text-xl font-semibold">{selectedClusterLabel}</div>
                </div>
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>当前筛选记录</div>
                  <div className="mt-2 text-xl font-semibold">{total}</div>
                </div>
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    theme === 'dark' ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>本页成功 / 失败</div>
                  <div className="mt-2 text-xl font-semibold">
                    <span className="text-green-500">{successCount}</span>
                    <span className={`mx-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>/</span>
                    <span className="text-red-500">{failedCount}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className={`rounded-xl border shadow-sm ${
                theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'
              }`}
            >
              <div className="p-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="relative md:col-span-2">
                    <Search
                      size={16}
                      className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索资源名称、结果信息或操作人"
                      className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none ${
                        theme === 'dark'
                          ? 'border-gray-600 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white text-gray-900'
                      }`}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
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
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
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

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    value={resourceTypeFilter}
                    onChange={(event) => setResourceTypeFilter(event.target.value)}
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
                  {(query || statusFilter || actionFilter || resourceTypeFilter || clusterFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setStatusFilter('');
                        setActionFilter('');
                        setResourceTypeFilter('');
                        setClusterFilter('');
                      }}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        theme === 'dark'
                          ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      清空筛选
                    </button>
                  )}
                </div>
              </div>

              <div className="px-5 pb-5">
                {loading ? (
                  <div
                    className={`rounded-lg border px-4 py-8 text-sm ${
                      theme === 'dark'
                        ? 'border-gray-700 bg-gray-900/40 text-gray-400'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    正在加载审计日志...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div
                    className={`rounded-lg border px-4 py-8 text-sm ${
                      theme === 'dark'
                        ? 'border-gray-700 bg-gray-900/40 text-gray-400'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    当前筛选条件下还没有可显示的操作记录。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {auditLogs.map((entry) => {
                      const statusMeta = getAuditStatusMeta(entry.status, theme === 'dark' ? 'dark' : 'light');
                      return (
                        <div
                          key={entry.id}
                          className={`rounded-xl border px-4 py-4 ${
                            theme === 'dark'
                              ? 'border-gray-700 bg-gray-900/40'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.badgeClass}`}
                                >
                                  {statusMeta.label}
                                </span>
                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                  {getAuditActionLabel(entry.action)}
                                </span>
                                <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {entry.namespace ? `${entry.namespace}/` : ''}
                                  {entry.resourceName || '-'}
                                </span>
                              </div>
                              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {entry.message || '已记录操作结果'}
                              </p>
                              <div
                                className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${
                                  theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                                }`}
                              >
                                <span>资源类型：{entry.resourceType || '-'}</span>
                                <span>集群：{entry.clusterName || entry.clusterId || '未指定'}</span>
                                <span>操作人：{entry.actorName || entry.actorEmail || '系统'}</span>
                              </div>
                            </div>
                            <div className={`shrink-0 text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                              {formatAuditTime(entry.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!loading && total > 0 && (
                <TablePagination
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalItems={total}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                />
              )}
            </motion.div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
