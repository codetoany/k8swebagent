export type ClusterMode = 'token' | 'kubeconfig' | 'in-cluster';

export interface ClusterConfig {
  id: string;
  name: string;
  mode: ClusterMode;
  apiServer: string;
  kubeconfigPath: string;
  kubeconfig: string;
  token: string;
  caData: string;
  insecureSkipTLSVerify: boolean;
  isDefault: boolean;
  isEnabled: boolean;
  hasToken: boolean;
  hasKubeconfig: boolean;
  lastConnectionStatus: string;
  lastConnectionError: string;
  lastConnectedAt: string;
  updatedAt: string;
}

export const createEmptyClusterConfig = (): ClusterConfig => ({
  id: '',
  name: '',
  mode: 'token',
  apiServer: '',
  kubeconfigPath: '',
  kubeconfig: '',
  token: '',
  caData: '',
  insecureSkipTLSVerify: false,
  isDefault: false,
  isEnabled: true,
  hasToken: false,
  hasKubeconfig: false,
  lastConnectionStatus: 'unknown',
  lastConnectionError: '',
  lastConnectedAt: '',
  updatedAt: '',
});
