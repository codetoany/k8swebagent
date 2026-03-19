import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Eraser,
  PlugZap,
  RefreshCw,
  Terminal as TerminalIcon,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import apiClient, { buildWebSocketUrl } from '@/lib/apiClient';
import { nodeShellAPI, nodesAPI, replacePathParams } from '@/lib/api';
import type { NodeShellMeta } from '@/lib/types';
import { canOpenNodeShell, getNodeShellUnavailableReason } from '@/lib/nodes';

type ConnectionStatus = 'initializing' | 'connecting' | 'connected' | 'disconnected' | 'error';

type NodeShellSocketMessage = {
  type?: string;
  data?: string;
  message?: string;
  code?: number;
};

interface NodeShellModalProps {
  node: {
    name: string;
    status?: string;
    os?: string;
    labels?: Record<string, string>;
  };
  clusterId?: string;
  theme: string;
  onClose: () => void;
}

const defaultMeta: NodeShellMeta = {
  enabled: false,
  adminOnly: true,
  sessionTimeoutSeconds: 1800,
  namespace: 'k8s-agent-system',
  daemonSetName: 'k8s-agent-host-shell',
  podLabelSelector: 'app.kubernetes.io/name=k8s-agent-host-shell',
  containerName: 'host-shell',
  shellPath: '/bin/sh',
  commandPreview: 'nsenter -t 1 -m -u -i -n -p -- chroot /proc/1/root /bin/sh -l',
  installed: false,
  desiredPods: 0,
  readyPods: 0,
  availablePods: 0,
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

const NodeShellModal = ({ node, clusterId, theme, onClose }: NodeShellModalProps) => {
  const isDark = theme === 'dark';
  const [meta, setMeta] = useState<NodeShellMeta>(defaultMeta);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState('正在加载节点终端配置...');
  const [terminalReady, setTerminalReady] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const endpoint = useMemo(
    () => replacePathParams(nodesAPI.shell, { name: node.name }),
    [node.name],
  );

  useEffect(() => {
    let active = true;

    const loadMeta = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<NodeShellMeta>(
          nodeShellAPI.meta,
          clusterId ? { clusterId } : undefined,
        );
        if (!active) {
          return;
        }
        setMeta({ ...defaultMeta, ...response });
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : '无法加载节点终端配置';
        setMeta({ ...defaultMeta, message });
        setConnectionStatus('error');
        setStatusMessage(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadMeta();

    return () => {
      active = false;
    };
  }, [clusterId]);

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
    terminal.writeln(`准备连接节点终端 ${node.name}...`);

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
  }, [isDark, node.name]);

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
    const runtimeReady = meta.enabled && meta.installed && meta.readyPods > 0;

    if (loading) {
      terminal.clear();
      terminal.writeln('正在加载节点终端配置...');
      setConnectionStatus('initializing');
      setStatusMessage('正在加载节点终端配置...');
      return;
    }

    if (!canOpenNodeShell(node)) {
      const message = getNodeShellUnavailableReason(node);
      terminal.clear();
      terminal.writeln(`Node shell ${node.name}`);
      if (node.status) {
        terminal.writeln(`Current status: ${node.status}`);
      }
      terminal.writeln(`\x1b[33m${message}\x1b[0m`);
      setConnectionStatus('error');
      setStatusMessage(message);
      return;
    }

    if (!meta.enabled) {
      const message = meta.message || '节点终端未启用，请先在后端配置中开启。';
      terminal.clear();
      terminal.writeln('\x1b[33m节点终端当前未启用。\x1b[0m');
      terminal.writeln(message);
      setConnectionStatus('error');
      setStatusMessage(message);
      return;
    }

    if (!runtimeReady) {
      const message = meta.message || 'host-shell DaemonSet 尚未就绪，请先完成部署。';
      terminal.clear();
      terminal.writeln('\x1b[31m节点终端运行时未就绪。\x1b[0m');
      terminal.writeln(message);
      setConnectionStatus('error');
      setStatusMessage(message);
      return;
    }

    const query: Record<string, string> = {};
    if (clusterId) {
      query.clusterId = clusterId;
    }

    const url = buildWebSocketUrl(endpoint, query);
    let disposed = false;
    let readyReceived = false;

    terminal.clear();
    terminal.writeln(`连接节点终端 ${node.name}`);
    terminal.writeln('请稍候，正在建立宿主机会话...');
    setConnectionStatus('connecting');
    setStatusMessage(`正在连接节点 ${node.name} ...`);

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

      let payload: NodeShellSocketMessage;
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
          setStatusMessage(`已连接到节点 ${node.name}`);
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
          setStatusMessage(payload.message || '节点终端连接异常');
          terminal.writeln(`\r\n\x1b[31m${payload.message || '节点终端连接异常'}\x1b[0m`);
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
      setStatusMessage('节点终端连接失败，请检查后端配置和节点运行状态。');
    };

    socket.onclose = (event) => {
      if (disposed) {
        return;
      }

      if (!readyReceived && event.code !== 1000) {
        setConnectionStatus('error');
        setStatusMessage('节点终端握手失败，请重新连接。');
        terminal.writeln('\r\n\x1b[31m节点终端握手失败，请检查 DaemonSet、鉴权和节点状态。\x1b[0m');
        return;
      }

      if (readyReceived) {
        setConnectionStatus('disconnected');
        setStatusMessage(event.reason || '节点终端连接已关闭');
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
  }, [clusterId, endpoint, loading, meta, node, reconnectNonce, terminalReady]);

  const handleReconnect = () => {
    setReconnectNonce((value) => value + 1);
  };

  const handleClear = () => {
    terminalRef.current?.clear();
    terminalRef.current?.writeln(`节点终端已清空：${node.name}`);
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
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${
        isDark ? 'bg-black/75' : 'bg-slate-950/35'
      }`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                isDark ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700'
              }`}
            >
              <TerminalIcon size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">节点终端</div>
              <div className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {node.name}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              aria-label="清空"
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
              aria-label="重新连接"
            >
              <RefreshCw size={14} />
              <span>重新连接</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg p-2 ${
                isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              aria-label="关闭终端"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div
              className={`flex items-center justify-between gap-3 border-b px-4 py-3 text-xs ${
                isDark ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <PlugZap size={14} className={connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'} />
                <span className="truncate">{statusMessage}</span>
              </div>
              <div className="shrink-0">当前会话会直接进入节点宿主机命名空间</div>
            </div>

            <div className={`px-4 py-4 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
              <div
                ref={terminalHostRef}
                className={`h-[58vh] min-h-[360px] w-full overflow-hidden rounded-2xl border ${
                  isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
                onClick={() => terminalRef.current?.focus()}
              />
            </div>

            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs ${
                isDark ? 'border-slate-700 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <div className="truncate">目标节点：{node.name}</div>
              <div className="truncate">会话方式：WebSocket + xterm.js + host-shell</div>
            </div>
          </div>

          <div
            className={`border-l p-4 ${
              isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'
            }`}
          >
            <div
              className={`mb-4 rounded-2xl border p-4 ${
                isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle size={16} />
                <span>高危提示</span>
              </div>
              <div className="space-y-2 text-xs leading-6">
                <p>该终端会通过 privileged DaemonSet 进入节点宿主机，权限接近 root。</p>
                <p>终端输入和会话结果会记录到审计日志，建议仅用于节点级排障和紧急运维。</p>
              </div>
            </div>

            <div
              className={`mb-4 rounded-2xl border p-4 ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="mb-3 text-sm font-semibold">运行时状态</div>
              <div className={`space-y-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span>节点终端开关</span>
                  <span>{meta.enabled ? '已启用' : '未启用'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>DaemonSet</span>
                  <span>{meta.installed ? `${meta.namespace}/${meta.daemonSetName}` : '未部署'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Ready Pods</span>
                  <span>{meta.readyPods}/{meta.desiredPods}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>容器名</span>
                  <span>{meta.containerName}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>会话超时</span>
                  <span>{Math.max(1, Math.round(meta.sessionTimeoutSeconds / 60))} 分钟</span>
                </div>
                {meta.message ? (
                  <div
                    className={`rounded-xl px-3 py-2 leading-5 ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {meta.message}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="mb-3 text-sm font-semibold">进入方式</div>
              <div className={`space-y-2 text-xs leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <p>终端会先连接当前节点上的 host-shell Pod，再通过 nsenter/chroot 进入宿主机。</p>
                <div
                  className={`rounded-xl border px-3 py-2 font-mono ${
                    isDark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {meta.commandPreview}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeShellModal;
