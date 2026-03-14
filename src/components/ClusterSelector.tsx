import { ChevronDown, RefreshCw } from 'lucide-react';
import type { ClusterConfig } from '@/lib/clusters';

type ClusterSelectorProps = {
  theme: 'light' | 'dark';
  clusters: ClusterConfig[];
  value: string;
  loading?: boolean;
  onChange: (clusterId: string) => void;
  className?: string;
};

export default function ClusterSelector({
  theme,
  clusters,
  value,
  loading = false,
  onChange,
  className = '',
}: ClusterSelectorProps) {
  return (
    <div className={`relative min-w-[180px] ${className}`}>
      <select
        className={`appearance-none w-full pl-3 pr-9 py-2 rounded-lg text-sm focus:outline-none border ${
          theme === 'dark'
            ? 'bg-gray-700 border-gray-600 text-white'
            : 'bg-gray-100 border-gray-200 text-gray-900'
        }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || clusters.length === 0}
      >
        {clusters.length === 0 ? (
          <option value="">暂无可用集群</option>
        ) : (
          clusters.map((cluster) => (
            <option key={cluster.id} value={cluster.id}>
              {cluster.name}
            </option>
          ))
        )}
      </select>
      {loading ? (
        <RefreshCw
          size={14}
          className={`absolute right-3 top-1/2 -translate-y-1/2 animate-spin ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}
        />
      ) : (
        <ChevronDown
          size={14}
          className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}
        />
      )}
    </div>
  );
}
