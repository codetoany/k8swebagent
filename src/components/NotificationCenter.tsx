import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, Database, Network, RefreshCw, Server } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { notificationsAPI } from '@/lib/api';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';

type NotificationKind = 'node' | 'pod' | 'workload';
type NotificationLevel = 'critical' | 'info';

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  level: NotificationLevel;
  title: string;
  message: string;
  action: string;
  resourceType: string;
  resourceName: string;
  clusterId?: string;
  clusterName?: string;
  createdAt: string;
  read: boolean;
};

type NotificationListResponse = {
  items: NotificationItem[];
  unreadCount: number;
  total: number;
  lastReadAt?: string;
};

const kindLabelMap: Record<NotificationKind, string> = {
  node: '节点',
  pod: 'Pod',
  workload: '工作负载',
};

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function NotificationCenter() {
  const { isDark } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const currentTheme = isDark ? 'dark' : 'light';
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<NotificationListResponse>({
    items: [],
    unreadCount: 0,
    total: 0,
  });

  const clusterId = selectedCluster?.id || '';

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const nextPayload = await apiClient.get<NotificationListResponse>(
        notificationsAPI.listNotifications,
        clusterId ? { clusterId, limit: 12 } : { limit: 12 },
      );
      setPayload({
        items: Array.isArray(nextPayload?.items) ? nextPayload.items : [],
        unreadCount: nextPayload?.unreadCount ?? 0,
        total: nextPayload?.total ?? 0,
        lastReadAt: nextPayload?.lastReadAt,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [clusterId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadNotifications();
  }, [open, clusterId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const markAllRead = async () => {
    await apiClient.post<{ lastReadAt?: string }>(notificationsAPI.markAllRead);
    setPayload((current) => ({
      ...current,
      unreadCount: 0,
      items: current.items.map((item) => ({ ...item, read: true })),
    }));
  };

  const unreadBadge = useMemo(() => {
    if (payload.unreadCount <= 0) {
      return '';
    }
    if (payload.unreadCount > 9) {
      return '9+';
    }
    return String(payload.unreadCount);
  }, [payload.unreadCount]);

  const getItemMeta = (item: NotificationItem) => {
    if (item.level === 'critical') {
      return {
        Icon: AlertTriangle,
        iconClass: 'text-red-500',
        badgeClass: currentTheme === 'dark' ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700',
      };
    }

    switch (item.kind) {
      case 'node':
        return {
          Icon: Server,
          iconClass: 'text-blue-500',
          badgeClass: currentTheme === 'dark' ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700',
        };
      case 'pod':
        return {
          Icon: Database,
          iconClass: 'text-emerald-500',
          badgeClass: currentTheme === 'dark' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
        };
      default:
        return {
          Icon: Network,
          iconClass: 'text-amber-500',
          badgeClass: currentTheme === 'dark' ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-700',
        };
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative rounded-full p-2 ${currentTheme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
        aria-label="查看通知"
      >
        <Bell size={20} />
        {unreadBadge ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadBadge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={`absolute right-0 z-50 mt-3 w-[360px] overflow-hidden rounded-xl border shadow-xl ${
            currentTheme === 'dark' ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-200 bg-white text-gray-900'
          }`}
        >
          <div className={`flex items-center justify-between border-b px-4 py-3 ${currentTheme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <div>
              <h3 className="text-sm font-semibold">通知中心</h3>
              <p className={`mt-1 text-xs ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                {payload.total > 0 ? `最近 ${payload.total} 条通知` : '暂无通知'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className={`rounded-lg p-2 ${currentTheme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                aria-label="刷新通知"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={payload.unreadCount === 0}
                className={`inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium ${
                  currentTheme === 'dark'
                    ? 'bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-50'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                }`}
              >
                <CheckCheck size={14} className="mr-1.5" />
                全部已读
              </button>
            </div>
          </div>

          <div className={`max-h-[420px] overflow-y-auto ${currentTheme === 'dark' ? 'divide-y divide-gray-700' : 'divide-y divide-gray-100'}`}>
            {loading && payload.items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">正在加载通知...</div>
            ) : payload.items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={26} className={`mx-auto mb-3 ${currentTheme === 'dark' ? 'text-gray-500' : 'text-gray-300'}`} />
                <p className={`text-sm ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>当前没有符合条件的通知</p>
              </div>
            ) : (
              payload.items.map((item) => {
                const meta = getItemMeta(item);
                const Icon = meta.Icon;

                return (
                  <div
                    key={item.id}
                    className={`px-4 py-3 ${!item.read ? (currentTheme === 'dark' ? 'bg-gray-900/50' : 'bg-blue-50/40') : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 rounded-lg p-2 ${currentTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <Icon size={16} className={meta.iconClass} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className={`mt-1 text-xs ${currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                              {formatNotificationTime(item.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
                              {item.level === 'critical' ? '关键' : '通知'}
                            </span>
                            {!item.read ? <span className="h-2 w-2 rounded-full bg-red-500" /> : null}
                          </div>
                        </div>

                        <p className={`mt-2 text-sm leading-6 ${currentTheme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                          {item.message || `${kindLabelMap[item.kind]} ${item.resourceName} 有新的状态变更`}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-1 ${currentTheme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                            {kindLabelMap[item.kind]}
                          </span>
                          {item.resourceName ? (
                            <span className={`rounded-full px-2 py-1 ${currentTheme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                              {item.resourceName}
                            </span>
                          ) : null}
                          {item.clusterName ? (
                            <span className={`rounded-full px-2 py-1 ${currentTheme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                              {item.clusterName}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
