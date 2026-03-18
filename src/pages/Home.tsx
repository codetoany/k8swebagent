import { useContext, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Moon, Server, Sun, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/useTheme';
import { AuthContext } from '@/contexts/authContext';

export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, authLoading, login } = useContext(AuthContext);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const success = await login(username, password);
    setSubmitting(false);

    if (success) {
      toast.success('登录成功');
      navigate('/dashboard', { replace: true });
      return;
    }

    toast.error('用户名或密码错误');
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
      }`}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col justify-center"
          >
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/15 text-blue-500">
              <Server size={32} />
            </div>
            <h1 className="mb-4 text-5xl font-bold tracking-tight">K8s Agent</h1>
            <p className={`max-w-xl text-lg leading-8 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              面向 Kubernetes 运维场景的智能助手，统一连接集群、巡检风险、诊断问题并辅助执行操作。
            </p>
            <div className="mt-8 space-y-3 text-sm">
              <div className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                默认账号：<span className="font-medium text-blue-500">admin / admin123</span>
              </div>
              <div className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                也提供 <span className="font-medium">operator / operator123</span> 和{' '}
                <span className="font-medium">viewer / viewer123</span> 用于权限验证。
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`rounded-3xl border p-8 shadow-xl ${
              isDark ? 'border-gray-700 bg-gray-800/90' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">登录控制台</h2>
                <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  使用系统账号登录后，按角色加载可访问的页面与操作权限。
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className={`rounded-full p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className={`mb-2 block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  用户名
                </span>
                <div
                  className={`flex items-center rounded-xl border px-3 ${
                    isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <User size={18} className="text-gray-400" />
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full bg-transparent px-3 py-3 outline-none"
                    placeholder="请输入用户名"
                  />
                </div>
              </label>

              <label className="block">
                <span className={`mb-2 block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  密码
                </span>
                <div
                  className={`flex items-center rounded-xl border px-3 ${
                    isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <Lock size={18} className="text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent px-3 py-3 outline-none"
                    placeholder="请输入密码"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={submitting || authLoading}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting || authLoading ? '登录中...' : '进入系统'}
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
