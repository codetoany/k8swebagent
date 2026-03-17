import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Nodes from "@/pages/Nodes";
import Pods from "@/pages/Pods";
import Workloads from "@/pages/Workloads";
import Settings from "@/pages/Settings";
import AIDiagnosis from "@/pages/AIDiagnosis";
import AuditLogs from "@/pages/AuditLogs";
import Services from "@/pages/Services";
import Ingresses from "@/pages/Ingresses";
import ConfigMaps from "@/pages/ConfigMaps";
import Secrets from "@/pages/Secrets";
import Storage from "@/pages/Storage";
import Events from "@/pages/Events";
import { useState } from "react";
import { AuthContext } from '@/contexts/authContext';
import { ClusterProvider } from '@/contexts/clusterContext';
import { ThemeProvider } from '@/contexts/themeContext';
import { Toaster } from 'sonner';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true); // 默认已认证，便于演示

  const logout = () => {
    setIsAuthenticated(false);
  };

  const login = (username: string, password: string): boolean => {
    // 简化的登录逻辑，实际应用中应该有更复杂的认证流程
    if (username && password) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, setIsAuthenticated, logout, login }}
    >
      <ThemeProvider>
        <ClusterProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/pods" element={<Pods />} />
            <Route path="/workloads" element={<Workloads />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/services" element={<Services />} />
            <Route path="/ingresses" element={<Ingresses />} />
            <Route path="/configmaps" element={<ConfigMaps />} />
            <Route path="/secrets" element={<Secrets />} />
            <Route path="/storage" element={<Storage />} />
            <Route path="/events" element={<Events />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/ai-diagnosis" element={<AIDiagnosis />} />
          </Routes>
          <Toaster position="top-right" />
        </ClusterProvider>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}
