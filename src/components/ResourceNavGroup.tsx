import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ChevronDown,
  Database,
  FileCog,
  HardDrive,
  Package,
  Server,
  ShieldCheck,
  Waypoints,
  Zap,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

type ResourceNavGroupProps = {
  isDark: boolean;
  onNavigate?: () => void;
};

const resourceItems = [
  { label: '节点', path: '/nodes', icon: <Server size={18} /> },
  { label: 'Pods', path: '/pods', icon: <Database size={18} /> },
  { label: '工作负载', path: '/workloads', icon: <Package size={18} /> },
  { label: 'Services', path: '/services', icon: <Waypoints size={18} /> },
  { label: 'Ingresses', path: '/ingresses', icon: <Zap size={18} /> },
  { label: 'ConfigMaps', path: '/configmaps', icon: <FileCog size={18} /> },
  { label: 'Secrets', path: '/secrets', icon: <ShieldCheck size={18} /> },
  { label: '存储', path: '/storage', icon: <HardDrive size={18} /> },
  { label: 'Events', path: '/events', icon: <Boxes size={18} /> },
];

const ResourceNavGroup = ({ isDark, onNavigate }: ResourceNavGroupProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const resourceActive = useMemo(() => resourceItems.some((item) => item.path === currentPath), [currentPath]);
  const [expanded, setExpanded] = useState(resourceActive);

  useEffect(() => {
    if (resourceActive) {
      setExpanded(true);
    }
  }, [resourceActive]);

  const navigateTo = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-all duration-200 ${
          resourceActive
            ? isDark
              ? 'bg-blue-900/20 text-blue-300'
              : 'bg-blue-50 text-blue-600'
            : isDark
              ? 'text-gray-300 hover:bg-gray-800'
              : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className="text-lg">
            <Boxes size={20} />
          </span>
          <span className="font-medium">资源管理</span>
        </span>
        <ChevronDown size={16} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded ? (
        <div className="space-y-1">
          {resourceItems.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigateTo(item.path)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 pl-11 text-left text-sm transition-all duration-200 ${
                currentPath === item.path
                  ? isDark
                    ? 'bg-blue-900/30 text-blue-400'
                    : 'bg-blue-50 text-blue-600'
                  : isDark
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ResourceNavGroup;
