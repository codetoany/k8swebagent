import { useState, useContext, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Server, BarChart3, Database, Network, Settings, LogOut,
  Moon, Sun, Menu, X, User, Shield, AlertCircle, Globe,
  FileText, Lock, HardDrive, Activity, Briefcase,
} from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import { AuthContext } from '@/contexts/authContext';
import { useNavigate } from 'react-router-dom';
import ClusterSelector from '@/components/ClusterSelector';
import NotificationCenter from '@/components/NotificationCenter';

interface PageLayoutProps {
  title: string;
  activePath: string;
  children: ReactNode;
}

const navItems = [
  { icon: <BarChart3 size={20} />, label: '仪表盘', path: '/dashboard' },
  { icon: <Server size={20} />, label: '节点', path: '/nodes' },
  { icon: <Database size={20} />, label: 'Pods', path: '/pods' },
  { icon: <Briefcase size={20} />, label: '工作负载', path: '/workloads' },
  { icon: <Globe size={20} />, label: 'Services', path: '/services' },
  { icon: <Network size={20} />, label: 'Ingresses', path: '/ingresses' },
  { icon: <FileText size={20} />, label: 'ConfigMaps', path: '/configmaps' },
  { icon: <Lock size={20} />, label: 'Secrets', path: '/secrets' },
  { icon: <HardDrive size={20} />, label: '存储', path: '/storage' },
  { icon: <Activity size={20} />, label: '事件', path: '/events' },
  { icon: <Shield size={20} />, label: '操作审计', path: '/audit-logs' },
  { icon: <AlertCircle size={20} />, label: 'AI 诊断', path: '/ai-diagnosis' },
  { icon: <Settings size={20} />, label: '设置', path: '/settings' },
];

const PageLayout = ({ title, activePath, children }: PageLayoutProps) => {
  const { theme, toggleTheme, isDark } = useThemeContext();
  const { enabledClusters, loading: clustersLoading, selectedCluster, setSelectedClusterId } = useClusterContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentTheme = isDark ? 'dark' : 'light';

  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const renderNavItem = (icon: ReactNode, label: string, path: string, active: boolean = false) => (
    <motion.div
      key={path}
      className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all duration-300
        ${active
          ? theme === 'dark' ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
          : theme === 'dark' ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'
        }`}
      onClick={() => navigateTo(path)}
    >
      <span className="text-lg">{icon}</span>
      <span className="font-medium text-sm">{label}</span>
    </motion.div>
  );

  const sidebarContent = (
    <div className="p-3 space-y-0.5 flex-1 overflow-y-auto">
      {navItems.map(item => renderNavItem(item.icon, item.label, item.path, item.path === activePath))}
    </div>
  );

  return (
    <div className={`min-h-screen flex ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-300`}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)} />
          <motion.div
            className={`fixed top-0 left-0 h-full w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.3 }}
          >
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <Server className="text-blue-500" />
                <h2 className="text-xl font-bold">K8s Agent</h2>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-md hover:bg-gray-700"><X size={20} /></button>
            </div>
            {sidebarContent}
          </motion.div>
        </div>
      )}

      <div className={`hidden lg:flex lg:flex-col w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-r ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} h-screen fixed`}>
        <div className="p-4 border-b border-gray-700 flex items-center space-x-2">
          <Server className="text-blue-500" />
          <h2 className="text-xl font-bold">K8s Agent</h2>
        </div>
        {sidebarContent}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
                <User size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">管理员</div>
                <div className="text-xs opacity-70">admin@k8s-agent.com</div>
              </div>
            </div>
            <button onClick={() => { logout(); navigate('/'); }} className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 lg:ml-64">
        <header className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md hover:bg-gray-700"><Menu size={20} /></button>
              <h1 className="text-xl font-bold">{title}</h1>
            </div>
            <div className="flex items-center space-x-3">
              <ClusterSelector theme={currentTheme} clusters={enabledClusters} value={selectedCluster?.id || ''} loading={clustersLoading} onChange={setSelectedClusterId} className="w-48" />
              <button onClick={toggleTheme} className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationCenter />
            </div>
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
};

export default PageLayout;
