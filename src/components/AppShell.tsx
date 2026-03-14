import { ReactNode, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Database,
  LogOut,
  Menu,
  Moon,
  Network,
  Server,
  Settings,
  Sun,
  User,
} from 'lucide-react';

import { AuthContext } from '@/contexts/authContext';
import { useThemeContext } from '@/contexts/themeContext';

type NavItem = {
  label: string;
  path: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  { label: '仪表盘', path: '/dashboard', icon: <BarChart3 size={20} /> },
  { label: '节点', path: '/nodes', icon: <Server size={20} /> },
  { label: 'Pods', path: '/pods', icon: <Database size={20} /> },
  { label: '工作负载', path: '/workloads', icon: <Network size={20} /> },
  { label: '设置', path: '/settings', icon: <Settings size={20} /> },
  { label: 'AI 诊断', path: '/ai-diagnosis', icon: <AlertCircle size={20} /> },
];

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface AppShellProps {
  title: string;
  description?: string;
  activePath: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({
  title,
  description,
  activePath,
  actions,
  children,
}: AppShellProps) {
  const { theme, toggleTheme } = useThemeContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const dark = theme === 'dark';

  const navigateTo = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const sidebar = (
    <div className={clsx(
      'flex h-full flex-col border-r',
      dark ? 'border-gray-800 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-900',
    )}>
      <div className={clsx('flex items-center gap-3 border-b px-5 py-5', dark ? 'border-gray-800' : 'border-gray-200')}>
        <Server className="text-blue-500" />
        <div className="text-2xl font-bold">K8s Agent</div>
      </div>
      <div className="flex-1 space-y-2 px-3 py-4">
        {navItems.map((item) => {
          const active = item.path === activePath;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigateTo(item.path)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-medium transition',
                active && dark && 'bg-blue-900/30 text-blue-400',
                active && !dark && 'bg-blue-50 text-blue-600',
                !active && dark && 'text-gray-300 hover:bg-gray-800',
                !active && !dark && 'text-gray-700 hover:bg-gray-100',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className={clsx('flex items-center justify-between border-t px-4 py-4', dark ? 'border-gray-800' : 'border-gray-200')}>
        <div className="flex items-center gap-3">
          <div className={clsx('flex h-10 w-10 items-center justify-center rounded-full', dark ? 'bg-gray-800' : 'bg-gray-100')}>
            <User size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold">管理员</div>
            <div className={clsx('text-xs', dark ? 'text-gray-400' : 'text-gray-500')}>admin@k8s-agent.com</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/');
          }}
          className={clsx('rounded-full p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
          aria-label="退出登录"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={clsx('min-h-screen', dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900')}>
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64">
        {sidebar}
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            {sidebar}
          </div>
        </div>
      )}

      <div className="lg:ml-64">
        <header className={clsx(
          'sticky top-0 z-40 border-b px-4 py-4 md:px-6',
          dark ? 'border-gray-800 bg-gray-900/95' : 'border-gray-200 bg-white/95',
        )}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={clsx('rounded-lg p-2 lg:hidden', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
                aria-label="打开导航"
              >
                <Menu size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                {description ? (
                  <p className={clsx('mt-1 text-sm', dark ? 'text-gray-400' : 'text-gray-500')}>{description}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <button
                type="button"
                onClick={toggleTheme}
                className={clsx('rounded-full p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
                aria-label="切换主题"
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                type="button"
                className={clsx('relative rounded-full p-2', dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}
                aria-label="通知"
              >
                <Bell size={20} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
