import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle, Loader2, Copy, Check, FileText } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { toast } from 'sonner';

interface ApplyYAMLModalProps {
  clusterId?: string;
  theme: string;
  onClose: () => void;
}

interface ApplyResult {
  kind: string;
  name: string;
  namespace?: string;
  action: 'created' | 'updated';
}

const APPLY_API = '/apply';

const EXAMPLE_YAML = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: default
data:
  key: value
  app: k8s-agent`;

const ApplyYAMLModal: React.FC<ApplyYAMLModalProps> = ({ clusterId, theme, onClose }) => {
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isDark = theme === 'dark';

  const handleApply = async () => {
    if (!yaml.trim()) {
      toast.error('请输入 YAML 内容');
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const params = clusterId ? { clusterId } : undefined;
      const res = await apiClient.post<ApplyResult>(APPLY_API, { yaml }, { params });
      setResult(res);
      toast.success(`${res.kind}/${res.name} 已${res.action === 'created' ? '创建' : '更新'}`);
    } catch (err) {
      const msg = (err as Error).message || '应用失败';
      setError(msg);
      toast.error(`应用失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const loadExample = () => {
    setYaml(EXAMPLE_YAML);
    setResult(null);
    setError(null);
  };

  const handleCopyYaml = () => {
    if (!yaml) return;
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isDark ? 'bg-black/60' : 'bg-black/30'}`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-xl shadow-2xl flex flex-col ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-500" />
            <span className="font-semibold">应用 YAML 资源</span>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-md ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 操作提示 */}
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            粘贴 Kubernetes YAML 资源定义，点击「应用」创建或更新资源。支持常见资源类型（Pod、ConfigMap、Deployment 等）。
          </p>

          {/* YAML 编辑区 */}
          <div className="relative">
            <div className={`absolute top-2 right-2 flex gap-1.5 z-10`}>
              <button
                onClick={loadExample}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <FileText size={11} />
                示例
              </button>
              <button
                onClick={handleCopyYaml}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                复制
              </button>
            </div>
            <textarea
              value={yaml}
              onChange={e => {
                setYaml(e.target.value);
                setResult(null);
                setError(null);
              }}
              placeholder={`apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n  namespace: default\ndata:\n  key: value`}
              rows={16}
              className={`w-full p-4 rounded-lg border font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-950 border-gray-600 text-gray-100 placeholder-gray-600'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          {/* 成功结果 */}
          {result && (
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${isDark ? 'bg-green-900/20 border-green-700/50' : 'bg-green-50 border-green-200'}`}>
              <CheckCircle size={18} className="text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-600 dark:text-green-400 text-sm">
                  {result.action === 'created' ? '✓ 资源已创建' : '✓ 资源已更新'}
                </p>
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span className="font-mono">{result.kind}</span>
                  {result.namespace && <span className="font-mono"> {result.namespace}/</span>}
                  <span className="font-mono font-semibold">{result.name}</span>
                </p>
              </div>
            </div>
          )}

          {/* 错误结果 */}
          {error && (
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${isDark ? 'bg-red-900/20 border-red-700/50' : 'bg-red-50 border-red-200'}`}>
              <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-600 dark:text-red-400 text-sm">应用失败</p>
                <p className={`text-xs mt-1 font-mono break-all ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <div className={`flex items-center justify-end gap-3 px-5 py-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            取消
          </button>
          <button
            onClick={() => void handleApply()}
            disabled={loading || !yaml.trim()}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              loading || !yaml.trim()
                ? 'opacity-40 cursor-not-allowed bg-blue-500 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {loading ? '应用中...' : '应用'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApplyYAMLModal;
