import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import Nodes from '@/pages/Nodes';
import Pods from '@/pages/Pods';
import Workloads from '@/pages/Workloads';
import Settings from '@/pages/Settings';
import AIDiagnosis from '@/pages/AIDiagnosis';
import AuditLogs from '@/pages/AuditLogs';
import Services from '@/pages/Services';
import Ingresses from '@/pages/Ingresses';
import ConfigMaps from '@/pages/ConfigMaps';
import Secrets from '@/pages/Secrets';
import Storage from '@/pages/Storage';
import Events from '@/pages/Events';
import { AuthContext } from '@/contexts/authContext';
import { ClusterProvider } from '@/contexts/clusterContext';
import { ThemeProvider } from '@/contexts/themeContext';
import apiClient, { ApiError } from '@/lib/apiClient';
import { authAPI } from '@/lib/api';
import type { LoginResponse, UserInfo } from '@/lib/types';

const AUTH_TOKEN_KEY = 'authToken';

type GuardProps = {
  isAuthenticated: boolean;
  authLoading: boolean;
  children: JSX.Element;
  permission?: string;
  currentUser: UserInfo | null;
};

const AccessDenied = () => (
  <div className="flex min-h-screen items-center justify-center bg-gray-900 px-6 text-white">
    <div className="max-w-md rounded-2xl border border-gray-700 bg-gray-800 p-8 text-center shadow-xl">
      <h2 className="mb-3 text-2xl font-semibold">无权访问</h2>
      <p className="text-sm text-gray-400">当前账号没有访问该页面的权限，请联系管理员分配权限。</p>
    </div>
  </div>
);

const ProtectedRoute = ({
  isAuthenticated,
  authLoading,
  children,
  permission,
  currentUser,
}: GuardProps) => {
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-400">正在校验登录状态...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (permission && currentUser?.role !== 'admin' && !currentUser?.permissions.includes(permission)) {
    return <AccessDenied />;
  }

  return children;
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        if (active) {
          setIsAuthenticated(false);
          setCurrentUser(null);
          setAuthLoading(false);
        }
        return;
      }

      try {
        const user = await apiClient.get<UserInfo>(authAPI.getUserInfo);
        if (!active) {
          return;
        }
        setCurrentUser(user);
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        if (!active) {
          return;
        }
        setCurrentUser(null);
        setIsAuthenticated(false);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.post<LoginResponse>(authAPI.login, {
        username,
        password,
      });
      localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      setCurrentUser(response.user);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }
      return false;
    }
  };

  const logout = async () => {
    try {
      await apiClient.post(authAPI.logout);
    } catch {
      // ignore logout cleanup failures
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setCurrentUser(null);
      setIsAuthenticated(false);
    }
  };

  const authValue = useMemo(
    () => ({
      isAuthenticated,
      authLoading,
      currentUser,
      setIsAuthenticated,
      login,
      logout,
      hasPermission: (permission: string) => {
        if (!currentUser) {
          return false;
        }
        if (currentUser.role === 'admin') {
          return true;
        }
        return currentUser.permissions.includes(permission);
      },
      hasAnyPermission: (permissions: string[]) => {
        if (!currentUser) {
          return false;
        }
        if (currentUser.role === 'admin') {
          return true;
        }
        return permissions.some((permission) => currentUser.permissions.includes(permission));
      },
    }),
    [authLoading, currentUser, isAuthenticated],
  );

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeProvider>
        <ClusterProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="dashboard:read"
                >
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nodes"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="nodes:read"
                >
                  <Nodes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pods"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="pods:read"
                >
                  <Pods />
                </ProtectedRoute>
              }
            />
            <Route
              path="/workloads"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="workloads:read"
                >
                  <Workloads />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="audit:read"
                >
                  <AuditLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/services"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="services:read"
                >
                  <Services />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ingresses"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="ingresses:read"
                >
                  <Ingresses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configmaps"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="configmaps:read"
                >
                  <ConfigMaps />
                </ProtectedRoute>
              }
            />
            <Route
              path="/secrets"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="secrets:read"
                >
                  <Secrets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/storage"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="storage:read"
                >
                  <Storage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="events:read"
                >
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="settings:read"
                >
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ai-diagnosis"
              element={
                <ProtectedRoute
                  isAuthenticated={isAuthenticated}
                  authLoading={authLoading}
                  currentUser={currentUser}
                  permission="diagnosis:read"
                >
                  <AIDiagnosis />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />} />
          </Routes>
          <Toaster position="top-right" />
        </ClusterProvider>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}
