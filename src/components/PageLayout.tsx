import { useContext, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  LogOut,
  Menu,
  Moon,
  Server,
  Settings,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import { AuthContext } from '@/contexts/authContext';
import ClusterSelector from '@/components/ClusterSelector';
import NotificationCenter from '@/components/NotificationCenter';
import ResourceNavGroup from '@/components/ResourceNavGroup';

interface PageLayoutProps {
  title: string;
  activePath: string;
  children: ReactNode;
}

const navItems = [
  { icon: <BarChart3 size={20} />, label: '仪表盘', path: '/dashboard' },
  { icon: <Shield size={20} />, label: '操作审计', path: '/audit-logs' },
  { icon: <AlertCircle size={20} />, label: 'AI 诊断', path: '/ai-diagnosis' },
  { icon: <Settings size={20} />, label: '设置', path: '/settings' },
];

const PageLayout = ({ title, activePath, children }: PageLayoutProps) => {
  const { theme, toggleTheme, isDark } = useThemeContext();
  const {
    enabledClusters,
    loading: clustersLoading,
    selectedCluster,
    setSelectedClusterId,
  } = useClusterContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentTheme = isDark ? 'dark' : 'light';

  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const renderNavItem = (
    icon: ReactNode,
    label: string,
    path: string,
    active = false,
  ) => (
    <motion.div
      key={path}
      className={`flex items-center space-x-3 rounded-lg px-4 py-2.5 transition-all duration-300 ${
        active
          ? theme === 'dark'
            ? 'bg-blue-900/30 text-blue-400'
            : 'bg-blue-50 text-blue-600'
          : theme === 'dark'
            ? 'cursor-pointer text-gray-300 hover:bg-gray-800'
            : 'cursor-pointer text-gray-700 hover:bg-gray-100'
      }`}
      onClick={() => navigateTo(path)}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </motion.div>
  );

  const sidebarContent = (
    <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
      {renderNavItem(
        navItems[0].icon,
        navItems[0].label,
        navItems[0].path,
        navItems[0].path === activePath,
      )}
      <ResourceNavGroup
        isDark={theme === 'dark'}
        onNavigate={() => setSidebarOpen(false)}
      />
      {navItems.slice(1).map((item) =>
        renderNavItem(item.icon, item.label, item.path, item.path === activePath),
      )}
    </div>
  );

  return (
    <div
      className={`min-h-screen flex transition-colors duration-300 ${
        theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
      }`}
    >
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setSidebarOpen(false)}
          />
          <motion.div
            className={`fixed left-0 top-0 h-full w-64 shadow-lg ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            }`}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between border-b border-gray-700 p-4">
              <div className="flex items-center space-x-2">
                <Server className="text-blue-500" />
                <h2 className="text-xl font-bold">K8s Agent</h2>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-md p-1 hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            {sidebarContent}
          </motion.div>
        </div>
      ) : null}

      <div
        className={`fixed hidden h-screen w-64 flex-col border-r lg:flex ${
          theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-center space-x-2 border-b border-gray-700 p-4">
          <Server className="text-blue-500" />
          <h2 className="text-xl font-bold">K8s Agent</h2>
        </div>
        {sidebarContent}
        <div className="border-t border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                }`}
              >
                <User size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">管理员</div>
                <div className="text-xs opacity-70">admin@k8s-agent.com</div>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className={`rounded-full p-2 ${
                theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 lg:ml-64">
        <header
          className={`sticky top-0 z-40 border-b p-4 ${
            theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-md p-2 hover:bg-gray-700 lg:hidden"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-xl font-bold">{title}</h1>
            </div>
            <div className="flex items-center space-x-3">
              <ClusterSelector
                theme={currentTheme}
                clusters={enabledClusters}
                value={selectedCluster?.id || ''}
                loading={clustersLoading}
                onChange={setSelectedClusterId}
                className="w-48"
              />
              <button
                onClick={toggleTheme}
                className={`rounded-full p-2 ${
                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                }`}
              >
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
