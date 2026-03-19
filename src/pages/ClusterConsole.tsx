import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Eraser,
  PlugZap,
  RefreshCw,
  Terminal as TerminalIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import PageLayout from '@/components/PageLayout';
import apiClient, { buildWebSocketUrl } from '@/lib/apiClient';
import { clusterConsoleAPI, namespacesAPI } from '@/lib/api';
import type { ClusterConsoleMeta } from '@/lib/types';

type ConnectionStatus = 'initializing' | 'connecting' | 'connected' | 'disconnected' | 'error';

type ConsoleSocketMessage = {
  type?: string;
  data?: string;
  message?: string;
  code?: number;
};

const commandHints = [
  'kubectl get pods -A',
  'kubectl get events -A --sort-by=.lastTimestamp',
  'kubectl -n default get deploy',
  'kubectl -n kube-system get pods -o wide',
  'kubectl top nodes',
];

const defaultMeta: ClusterConsoleMeta = {
  enabled: false,
  adminOnly: true,
  sessionTimeoutSeconds: 1800,
  shellPath: '/bin/sh',
  kubectlPath: 'kubectl',
  shellAvailable: false,
  kubectlAvailable: false,
};

const buildTerminalTheme = (isDark: boolean) => ({
  background: isDark ? '#020617' : '#f8fafc',
  foreground: isDark ? '#e2e8f0' : '#0f172a',
  cursor: isDark ? '#22c55e' : '#0f766e',
  selectionBackground: isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(14, 165, 233, 0.25)',
  black: '#111827',
  brightBlack: '#6b7280',
  red: '#ef4444',
  brightRed: '#f87171',
  green: '#22c55e',
  brightGreen: '#4ade80',
  yellow: '#f59e0b',
  brightYellow: '#fbbf24',
  blue: '#3b82f6',
  brightBlue: '#60a5fa',
  magenta: '#a855f7',
  brightMagenta: '#c084fc',
  cyan: '#06b6d4',
  brightCyan: '#22d3ee',
  white: '#e5e7eb',
  brightWhite: '#f9fafb',
});

const pickNamespace = (current: string, items: string[]) => {
  if (current && items.includes(current)) {
    return current;
  }
  if (items.includes('default')) {
    return 'default';
  }
  return items[0] ?? 'default';
};

const ClusterConsole = () => {
  const { theme } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const isDark = theme === 'dark';
  const [meta, setMeta] = useState<ClusterConsoleMeta>(defaultMeta);
  const [loading, setLoading] = useState(true);
  const [namespaceOptions, setNamespaceOptions] = useState<string[]>(['default']);
  const [selectedNamespace, setSelectedNamespace] = useState('default');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState('正在加载集群命令台配置...');
  const [terminalReady, setTerminalReady] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const clusterParams = selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined;
  const sessionLabel = useMemo(
    () => `${selectedCluster?.name || '默认集群'} · ${selectedNamespace}`,
    [selectedCluster?.name, selectedNamespace],
  );

  useEffect(() => {
    let active = true;

    const loadConsoleMeta = async () => {
      setLoading(true);
      try {
        const [metaResponse, namespaceResponse] = await Promise.all([
          apiClient.get<ClusterConsoleMeta>(clusterConsoleAPI.meta, clusterParams),
          apiClient.get<Array<{ name: string }>>(namespacesAPI.listNamespaces, clusterParams),
        ]);
        if (!active) {
          return;
        }

        const nextNamespaces = Array.isArray(namespaceResponse) && namespaceResponse.length > 0
          ? namespaceResponse.map((item) => item.name)
          : ['default'];

        setMeta({ ...defaultMeta, ...metaResponse });
        setNamespaceOptions(nextNamespaces);
        setSelectedNamespace((current) => pickNamespace(current, nextNamespaces));
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : '无法加载集群命令台配置';
        setMeta({ ...defaultMeta, message });
        setNamespaceOptions(['default']);
        setSelectedNamespace('default');
        setConnectionStatus('error');
        setStatusMessage(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadConsoleMeta();

    return () => {
      active = false;
    };
  }, [selectedCluster?.id]);

  useEffect(() => {
    if (!terminalHostRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'Cascadia Code, Consolas, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: buildTerminalTheme(isDark),
    });
    const fitAddon = new FitAddon();

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch {
        return;
      }

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && terminal.cols > 0 && terminal.rows > 0) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    };

    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);
    fitAddon.fit();
    terminal.focus();
    terminal.writeln('准备连接集群命令台...');

    const dataDisposable = terminal.onData((data) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminalReady(true);
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      dataDisposable.dispose();
      socketRef.current?.close();
      socketRef.current = null;
      fitAddonRef.current = null;
      terminalRef.current = null;
      setTerminalReady(false);
      terminal.dispose();
    };
  }, [isDark]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }
    terminalRef.current.options.theme = buildTerminalTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    if (!terminalReady || !terminalRef.current || !fitAddonRef.current) {
      return;
    }

    const terminal = terminalRef.current;
    const runtimeReady = meta.enabled && meta.shellAvailable && meta.kubectlAvailable;

    if (loading) {
      terminal.clear();
      terminal.writeln('正在加载集群命令台配置...');
      setConnectionStatus('initializing');
      setStatusMessage('正在加载集群命令台配置...');
      return;
    }

    if (!meta.enabled) {
      const message = meta.message || '集群命令台未启用，请先在后端配置中开启。';
      terminal.clear();
      terminal.writeln('\x1b[33m集群命令台当前未启用。\x1b[0m');
      terminal.writeln(message);
      setConnectionStatus('error');
      setStatusMessage(message);
      return;
    }

    if (!runtimeReady) {
      const message = meta.message || '后端命令台运行时未就绪，请检查 shell 或 kubectl。';
      terminal.clear();
      terminal.writeln('\x1b[31m集群命令台运行时未就绪。\x1b[0m');
      terminal.writeln(message);
      setConnectionStatus('error');
      setStatusMessage(message);
      return;
    }

    const query: Record<string, string> = {
      namespace: selectedNamespace,
    };
    if (selectedCluster?.id) {
      query.clusterId = selectedCluster.id;
    }

    const url = buildWebSocketUrl(clusterConsoleAPI.ws, query);
    let disposed = false;
    let readyReceived = false;

    terminal.clear();
    terminal.writeln(`连接集群命令台 ${sessionLabel}`);
    terminal.writeln('请稍候，正在建立会话...');
    setConnectionStatus('connecting');
    setStatusMessage(`正在连接 ${sessionLabel} ...`);

    const socket = new WebSocket(url);
    socketRef.current = socket;

    const syncTerminalSize = () => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        return;
      }

      if (socket.readyState === WebSocket.OPEN && terminal.cols > 0 && terminal.rows > 0) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    };

    const fitTimer = window.setTimeout(syncTerminalSize, 80);

    socket.onopen = () => {
      if (disposed) {
        return;
      }
      syncTerminalSize();
      terminal.focus();
    };

    socket.onmessage = (event) => {
      if (disposed) {
        return;
      }

      let payload: ConsoleSocketMessage;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        terminal.write(String(event.data));
        return;
      }

      switch (payload.type) {
        case 'ready':
          readyReceived = true;
          setConnectionStatus('connected');
          setStatusMessage(`已连接到 ${sessionLabel}`);
          if (payload.message) {
            terminal.writeln(`\x1b[32m${payload.message}\x1b[0m`);
          }
          syncTerminalSize();
          break;
        case 'output':
          terminal.write(payload.data ?? '');
          break;
        case 'error':
          setConnectionStatus('error');
          setStatusMessage(payload.message || '集群命令台连接异常');
          terminal.writeln(`\r\n\x1b[31m${payload.message || '集群命令台连接异常'}\x1b[0m`);
          break;
        case 'exit':
          setConnectionStatus('disconnected');
          setStatusMessage(payload.message || '会话已结束');
          terminal.writeln(`\r\n\x1b[33m${payload.message || '会话已结束'}\x1b[0m`);
          break;
        default:
          if (payload.data) {
            terminal.write(payload.data);
          }
          break;
      }
    };

    socket.onerror = () => {
      if (disposed) {
        return;
      }
      setConnectionStatus('error');
      setStatusMessage('集群命令台连接失败，请检查后端配置和集群状态。');
    };

    socket.onclose = (event) => {
      if (disposed) {
        return;
      }
      if (!readyReceived && event.code !== 1000) {
        setConnectionStatus('error');
        setStatusMessage('集群命令台握手失败，请重新连接。');
        terminal.writeln('\r\n\x1b[31m集群命令台握手失败，请检查鉴权、kubectl 和集群连接状态。\x1b[0m');
        return;
      }
      if (readyReceived) {
        setConnectionStatus('disconnected');
        setStatusMessage(event.reason || '集群命令台连接已关闭');
      }
    };

    return () => {
      disposed = true;
      window.clearTimeout(fitTimer);
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'close' }));
      }
      socket.close();
    };
  }, [loading, meta, reconnectNonce, selectedCluster?.id, selectedNamespace, sessionLabel, terminalReady]);

  const handleReconnect = () => {
    setReconnectNonce((value) => value + 1);
  };

  const handleClear = () => {
    terminalRef.current?.clear();
    terminalRef.current?.writeln(`命令台已清空：${sessionLabel}`);
    terminalRef.current?.focus();
  };

  const statusBadgeClass = {
    initializing: isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700',
    connecting: isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-700',
    connected: isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
    disconnected: isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700',
    error: isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-100 text-red-700',
  }[connectionStatus];

  const statusLabel = {
    initializing: '初始化中',
    connecting: '连接中',
    connected: '已连接',
    disconnected: '已断开',
    error: '异常',
  }[connectionStatus];

  return (
    <PageLayout title="集群命令台" activePath="/cluster-console">
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={`overflow-hidden rounded-2xl border shadow-sm ${
            isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 ${
              isDark ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                  isDark ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  <TerminalIcon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">管理员集群命令台</div>
                  <div className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {selectedCluster?.name || '默认集群'} / {selectedNamespace}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedNamespace}
                  onChange={(event) => setSelectedNamespace(event.target.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                    isDark
                      ? 'border-slate-600 bg-slate-800 text-slate-100'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {namespaceOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass}`}>
                  {connectionStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
                  <span>{statusLabel}</span>
                </div>

                <button
                  type="button"
                  onClick={handleClear}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Eraser size={14} />
                  <span>清空</span>
                </button>

                <button
                  type="button"
                  onClick={handleReconnect}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    isDark ? 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                  }`}
                >
                  <RefreshCw size={14} />
                  <span>重新连接</span>
                </button>
              </div>
            </div>

            <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 text-xs ${
              isDark ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              <div className="flex min-w-0 items-center gap-2">
                <PlugZap size={14} className={connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'} />
                <span className="truncate">{statusMessage}</span>
              </div>
              <div className="shrink-0">输入 `kubectl ...` 命令即可直接操作当前集群</div>
            </div>

            <div className={`px-5 pt-5 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
              <div
                ref={terminalHostRef}
                className={`h-[62vh] min-h-[360px] w-full overflow-hidden rounded-2xl border ${
                  isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
                onClick={() => terminalRef.current?.focus()}
              />
            </div>

            <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs ${
              isDark ? 'bg-slate-900 text-slate-400' : 'bg-white text-slate-500'
            }`}>
              <div className="truncate">命令上下文：{sessionLabel}</div>
              <div className="truncate">会话方式：WebSocket + xterm.js + kubectl</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-2xl border p-4 shadow-sm ${
              isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle size={16} className="text-amber-400" />
                <span>会话说明</span>
              </div>
              <div className={`space-y-2 text-xs leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <p>当前页面仅管理员可见，命令会绑定到所选集群和命名空间上下文。</p>
                <p>常规命令可直接使用 `kubectl`，如需全局查看资源可手动加 `-A`。</p>
                <p>所有会话会写入审计日志，建议优先用于资源排障、查询和临时运维操作。</p>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${
              isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}>
              <div className="mb-3 text-sm font-semibold">运行时状态</div>
              <div className={`space-y-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span>命令台开关</span>
                  <span>{meta.enabled ? '已启用' : '未启用'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Shell</span>
                  <span>{meta.shellAvailable ? meta.shellPath : '不可用'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>kubectl</span>
                  <span>{meta.kubectlAvailable ? meta.kubectlPath : '不可用'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>会话超时</span>
                  <span>{Math.max(1, Math.round(meta.sessionTimeoutSeconds / 60))} 分钟</span>
                </div>
                {meta.message ? (
                  <div className={`rounded-xl px-3 py-2 leading-5 ${
                    isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {meta.message}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${
              isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}>
              <div className="mb-3 text-sm font-semibold">常用命令</div>
              <div className="space-y-2">
                {commandHints.map((command) => (
                  <div
                    key={command}
                    className={`rounded-xl border px-3 py-2 font-mono text-xs ${
                      isDark ? 'border-slate-700 bg-slate-950 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {command}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default ClusterConsole;
