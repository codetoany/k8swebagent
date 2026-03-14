import { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

import AppShell from '@/components/AppShell';
import apiClient from '@/lib/apiClient';
import { settingsAPI } from '@/lib/api';
import { useThemeContext } from '@/contexts/themeContext';
import type { Theme } from '@/hooks/useTheme';

interface SettingsPayload {
  theme: Theme;
  language: 'zh-CN' | 'en-US';
  autoRefreshInterval: number;
  showResourceUsage: boolean;
  showEvents: boolean;
  notifications: {
    level: 'all' | 'critical' | 'none';
    enabledTypes: string[];
  };
}

interface AIModel {
  id: string;
  name: string;
  apiBaseUrl: string;
  modelType: string;
  isDefault: boolean;
}

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const defaultSettings: SettingsPayload = {
  theme: 'system',
  language: 'zh-CN',
  autoRefreshInterval: 30,
  showResourceUsage: true,
  showEvents: true,
  notifications: {
    level: 'all',
    enabledTypes: ['node', 'pod', 'workload'],
  },
};

export default function SettingsPage() {
  const { theme, setTheme } = useThemeContext();
  const dark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsPayload>(defaultSettings);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);

  async function loadSettings() {
    setLoading(true);
    try {
      const [settingsData, modelData] = await Promise.all([
        apiClient.get<SettingsPayload>(settingsAPI.getSettings),
        apiClient.get<AIModel[]>(settingsAPI.getAIModels),
      ]);
      setSettings(settingsData);
      setAiModels(modelData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSettings = <K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    if (settings.theme !== 'system' && settings.theme !== 'light' && settings.theme !== 'dark') {
      return;
    }
    setTheme(settings.theme);
    localStorage.setItem('k8s-agent-settings', JSON.stringify(settings));
    toast.success('已保存当前设置');
  };

  return (
    <AppShell
      title="设置"
      description="查看后端下发的系统配置，并管理当前界面偏好"
      activePath="/settings"
      actions={(
        <button
          type="button"
          onClick={loadSettings}
          className={clsx('rounded-lg p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
          aria-label="刷新设置"
        >
          <RefreshCw size={18} />
        </button>
      )}
    >
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className={`h-[32rem] animate-pulse rounded-2xl ${dark ? 'bg-gray-900' : 'bg-white'}`} />
          <div className={`h-[32rem] animate-pulse rounded-2xl ${dark ? 'bg-gray-900' : 'bg-white'}`} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className={clsx('rounded-2xl border p-6 shadow-sm', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
            <h2 className="text-lg font-semibold">通用设置</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>主题</span>
                <select
                  value={settings.theme}
                  onChange={(event) => updateSettings('theme', event.target.value as Theme)}
                  className={clsx('w-full rounded-xl border px-4 py-3 outline-none', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white')}
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>语言</span>
                <select
                  value={settings.language}
                  onChange={(event) => updateSettings('language', event.target.value as 'zh-CN' | 'en-US')}
                  className={clsx('w-full rounded-xl border px-4 py-3 outline-none', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white')}
                >
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>自动刷新间隔</span>
                <input
                  type="number"
                  min={5}
                  value={settings.autoRefreshInterval}
                  onChange={(event) => updateSettings('autoRefreshInterval', Number(event.target.value))}
                  className={clsx('w-full rounded-xl border px-4 py-3 outline-none', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white')}
                />
              </label>

              <label className="space-y-2">
                <span className={clsx('text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>通知级别</span>
                <select
                  value={settings.notifications.level}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    notifications: {
                      ...current.notifications,
                      level: event.target.value as 'all' | 'critical' | 'none',
                    },
                  }))}
                  className={clsx('w-full rounded-xl border px-4 py-3 outline-none', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white')}
                >
                  <option value="all">全部</option>
                  <option value="critical">仅严重</option>
                  <option value="none">关闭</option>
                </select>
              </label>
            </div>

            <div className="mt-6 space-y-4">
              <label className="flex items-center justify-between rounded-xl border px-4 py-3">
                <span>显示资源使用图表</span>
                <input
                  type="checkbox"
                  checked={settings.showResourceUsage}
                  onChange={(event) => updateSettings('showResourceUsage', event.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border px-4 py-3">
                <span>显示最近事件</span>
                <input
                  type="checkbox"
                  checked={settings.showEvents}
                  onChange={(event) => updateSettings('showEvents', event.target.checked)}
                />
              </label>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
              >
                <Save size={16} />
                保存当前设置
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className={clsx('rounded-2xl border p-6 shadow-sm', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <h2 className="text-lg font-semibold">AI 模型</h2>
              <div className="mt-4 space-y-3">
                {aiModels.map((model) => (
                  <div key={model.id} className={clsx('rounded-xl border p-4', dark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50')}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className={clsx('mt-1 text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{model.apiBaseUrl}</div>
                        <div className={clsx('mt-1 text-xs uppercase', dark ? 'text-gray-500' : 'text-gray-400')}>{model.modelType}</div>
                      </div>
                      {model.isDefault ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">默认</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={clsx('rounded-2xl border p-6 shadow-sm', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white')}>
              <h2 className="text-lg font-semibold">当前后端配置</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className={dark ? 'text-gray-400' : 'text-gray-500'}>启用通知类型</span>
                  <span>{settings.notifications.enabledTypes.join(', ')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={dark ? 'text-gray-400' : 'text-gray-500'}>后端主题建议</span>
                  <span>{settings.theme}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={dark ? 'text-gray-400' : 'text-gray-500'}>自动刷新</span>
                  <span>{settings.autoRefreshInterval} 秒</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
