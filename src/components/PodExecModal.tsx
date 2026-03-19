import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Terminal as TerminalIcon, RefreshCw, Eraser, PlugZap, Wifi, WifiOff } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { buildWebSocketUrl } from '@/lib/apiClient';
import { execAPI, replacePathParams } from '@/lib/api';
import { canExecIntoPod, getPodExecUnavailableReason } from '@/lib/pods';
import { toast } from 'sonner';

interface PodExecModalProps {
  pod: { namespace: string; name: string; status?: string; containers: Array<{ name: string }> };
  clusterId?: string;
  theme: string;
  onClose: () => void;
}

type ConnectionStatus = 'initializing' | 'connecting' | 'connected' | 'disconnected' | 'error';

type ExecSocketMessage = {
  type?: string;
  data?: string;
  message?: string;
  container?: string;
  code?: number;
};

const buildTerminalTheme = (isDark: boolean) => ({
  background: isDark ? '#030712' : '#f8fafc',
  foreground: isDark ? '#e5e7eb' : '#0f172a',
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

const PodExecModal = ({ pod, clusterId, theme, onClose }: PodExecModalProps) => {
  const isDark = theme === 'dark';
  const [selectedContainer, setSelectedContainer] = useState(pod.containers[0]?.name ?? '');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState('正在初始化终端...');
  const [terminalReady, setTerminalReady] = useState(false);
  const [sessionNonce, setSessionNonce] = useState(0);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const endpoint = useMemo(() => replacePathParams(execAPI.exec, {
    namespace: pod.namespace,
    name: pod.name,
  }), [pod.name, pod.namespace]);

  useEffect(() => {
    setSelectedContainer(pod.containers[0]?.name ?? '');
    setSessionNonce((value) => value + 1);
  }, [pod.containers, pod.name, pod.namespace]);

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
      scrollback: 3000,
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
    terminal.writeln(`准备连接 ${pod.namespace}/${pod.name}...`);

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
  }, [isDark, pod.name, pod.namespace]);

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
    if (pod.status && !canExecIntoPod(pod)) {
      const reason = getPodExecUnavailableReason(pod);
      terminal.clear();
      terminal.writeln(`Pod terminal ${pod.namespace}/${pod.name}`);
      terminal.writeln(`Current status: ${pod.status}`);
      terminal.writeln(`\x1b[33m${reason}\x1b[0m`);
      setConnectionStatus('error');
      setStatusMessage(reason);
      return;
    }

    const query: Record<string, string> = { command: 'sh' };
    if (selectedContainer) {
      query.container = selectedContainer;
    }
    if (clusterId) {
      query.clusterId = clusterId;
    }

    const url = buildWebSocketUrl(endpoint, query);
    let disposed = false;
    let readyReceived = false;

    terminal.clear();
    terminal.writeln(`连接 Pod 终端 ${pod.namespace}/${pod.name}${selectedContainer ? ` · ${selectedContainer}` : ''}`);
    terminal.writeln('请稍候，正在建立会话...');
    setConnectionStatus('connecting');
    setStatusMessage('正在建立终端连接...');

    const socket = new WebSocket(url);
    socketRef.current = socket;

    const syncTerminalSize = () => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        return;
      }

      if (socket.readyState === WebSocket.OPEN && terminal.cols > 0 && terminal.rows > 0) {
        socket.send(JSON.stringify({
          type: 'resize',
          cols: terminal.cols,
          rows: terminal.rows,
        }));
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

      let payload: ExecSocketMessage;
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
          setStatusMessage(`已连接到 ${pod.namespace}/${pod.name}${payload.container ? ` · ${payload.container}` : ''}`);
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
          setStatusMessage(payload.message || '终端连接异常');
          terminal.writeln(`\r\n\x1b[31m${payload.message || '终端连接异常'}\x1b[0m`);
          break;
        case 'exit':
          setConnectionStatus('disconnected');
          setStatusMessage(payload.message || '终端会话已结束');
          terminal.writeln(`\r\n\x1b[33m${payload.message || '终端会话已结束'}\x1b[0m`);
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
      setStatusMessage('终端连接失败，请确认登录状态和容器状态');
    };

    socket.onclose = (event) => {
      if (disposed) {
        return;
      }

      if (!readyReceived && event.code !== 1000) {
        setConnectionStatus('error');
        setStatusMessage('终端握手失败，请重新连接');
        terminal.writeln('\r\n\x1b[31m终端握手失败，请检查登录状态或后端服务。\x1b[0m');
        toast.error('Pod 终端连接失败');
        return;
      }

      if (readyReceived) {
        setConnectionStatus('disconnected');
        setStatusMessage(event.reason || '终端连接已关闭');
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
  }, [clusterId, endpoint, pod.name, pod.namespace, selectedContainer, sessionNonce, terminalReady]);

  const handleReconnect = () => {
    setSessionNonce((value) => value + 1);
  };

  const handleClear = () => {
    terminalRef.current?.clear();
    terminalRef.current?.writeln(`终端已清空：${pod.namespace}/${pod.name}`);
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
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isDark ? 'bg-black/70' : 'bg-slate-950/35'}`}
      onClick={onClose}
    >
      <div
        className={`flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
        style={{ maxHeight: '84vh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
          isDark ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
            }`}>
              <TerminalIcon size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Pod 交互终端</div>
              <div className={`truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {pod.namespace}/{pod.name}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pod.containers.length > 1 ? (
              <select
                value={selectedContainer}
                onChange={(event) => setSelectedContainer(event.target.value)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {pod.containers.map((container) => (
                  <option key={container.name} value={container.name}>
                    {container.name}
                  </option>
                ))}
              </select>
            ) : null}

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
              className={`rounded-lg p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
              aria-label="关闭终端"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-xs ${
          isDark ? 'border-slate-700 bg-slate-950/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          <div className="flex min-w-0 items-center gap-2">
            <PlugZap size={14} className={connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'} />
            <span className="truncate">{statusMessage}</span>
          </div>
          <div className="shrink-0">点击终端区域后可直接输入命令</div>
        </div>

        <div className={`px-4 pt-4 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
          <div
            ref={terminalHostRef}
            className={`h-[52vh] min-h-[320px] w-full overflow-hidden rounded-xl border ${
              isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
            }`}
            onClick={() => terminalRef.current?.focus()}
          />
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs ${
          isDark ? 'bg-slate-900 text-slate-400' : 'bg-white text-slate-500'
        }`}>
          <div className="truncate">当前容器：{selectedContainer || '默认容器'}</div>
          <div className="truncate">会话方式：WebSocket + xterm.js</div>
        </div>
      </div>
    </div>
  );
};

export default PodExecModal;
