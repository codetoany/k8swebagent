import React, { useState, useRef, useEffect } from 'react';
import { X, Terminal, Send, Loader2, RefreshCw } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { replacePathParams } from '@/lib/api';
import { toast } from 'sonner';

interface PodExecModalProps {
  pod: { namespace: string; name: string; containers: Array<{ name: string }> };
  clusterId?: string;
  theme: string;
  onClose: () => void;
}

interface OutputLine {
  type: 'input' | 'output' | 'error' | 'info';
  content: string;
}

const EXEC_API = '/pods/:namespace/:name/exec';

const PodExecModal: React.FC<PodExecModalProps> = ({ pod, clusterId, theme, onClose }) => {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(pod.containers[0]?.name ?? '');
  const [outputLines, setOutputLines] = useState<OutputLine[]>([
    { type: 'info', content: `已连接到 Pod: ${pod.namespace}/${pod.name}` },
    { type: 'info', content: '输入命令后按 Enter 或点击执行按钮' },
  ]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runCommand = async (cmd: string) => {
    if (!cmd.trim()) return;

    setOutputLines(prev => [...prev, { type: 'input', content: `$ ${cmd}` }]);
    setCommand('');
    setLoading(true);

    try {
      const endpoint = replacePathParams(EXEC_API, {
        namespace: pod.namespace,
        name: pod.name,
      });
      const params = clusterId ? { clusterId } : undefined;
      const res = await apiClient.post<{ stdout: string; stderr: string; error?: string }>(
        endpoint,
        { command: cmd, container: selectedContainer },
        { params }
      );

      if (res.stdout) {
        const lines = res.stdout.split('\n').filter(Boolean);
        setOutputLines(prev => [
          ...prev,
          ...lines.map(line => ({ type: 'output' as const, content: line })),
        ]);
      }
      if (res.stderr) {
        const lines = res.stderr.split('\n').filter(Boolean);
        setOutputLines(prev => [
          ...prev,
          ...lines.map(line => ({ type: 'error' as const, content: line })),
        ]);
      }
      if (res.error && !res.stdout && !res.stderr) {
        setOutputLines(prev => [...prev, { type: 'error', content: `[错误] ${res.error}` }]);
      }
    } catch (err) {
      const msg = (err as Error).message || '执行失败';
      setOutputLines(prev => [...prev, { type: 'error', content: `[错误] ${msg}` }]);
      toast.error(`命令执行失败: ${msg}`);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      void runCommand(command);
    }
  };

  const clearOutput = () => {
    setOutputLines([{ type: 'info', content: `Pod: ${pod.namespace}/${pod.name} — 输出已清空` }]);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isDark ? 'bg-black/60' : 'bg-black/30'}`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-3xl rounded-xl shadow-2xl flex flex-col ${isDark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-green-400" />
            <span className="font-semibold text-sm">
              Pod 命令执行 — {pod.namespace}/{pod.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {pod.containers.length > 1 && (
              <select
                value={selectedContainer}
                onChange={e => setSelectedContainer(e.target.value)}
                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}
              >
                {pod.containers.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={clearOutput}
              className={`p-1.5 rounded-md ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              title="清空输出"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-md ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 输出区域 */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-gray-950 text-gray-100"
          style={{ minHeight: '300px', maxHeight: '50vh' }}
          onClick={() => inputRef.current?.focus()}
        >
          {outputLines.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${
              line.type === 'input' ? 'text-green-400 mt-1' :
              line.type === 'error' ? 'text-red-400' :
              line.type === 'info' ? 'text-blue-400 italic' :
              'text-gray-100'
            }`}>
              {line.content}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-yellow-400 mt-1">
              <Loader2 size={12} className="animate-spin" />
              <span>执行中...</span>
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className={`flex items-center gap-2 px-4 py-3 border-t ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <span className="text-green-400 font-mono text-sm">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令，按 Enter 执行..."
            disabled={loading}
            className={`flex-1 bg-transparent outline-none font-mono text-sm ${isDark ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'}`}
          />
          <button
            onClick={() => void runCommand(command)}
            disabled={loading || !command.trim()}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              loading || !command.trim()
                ? 'opacity-40 cursor-not-allowed bg-gray-700 text-gray-400'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            执行
          </button>
        </div>
      </div>
    </div>
  );
};

export default PodExecModal;
