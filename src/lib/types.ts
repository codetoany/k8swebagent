// K8s Agent 类型定义

// 认证相关类型
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
}

// 集群概览类型
export interface ClusterOverview {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  totalPods: number;
  runningPods: number;
  failedPods: number;
  pausedPods: number;
  totalWorkloads: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

// 资源使用类型
export interface ResourceUsageData {
  time: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

// 事件类型
export interface ClusterEvent {
  id: string;
  type: 'warning' | 'info' | 'error' | 'success';
  reason: string;
  message: string;
  timestamp: string;
  involvedObject: {
    kind: string;
    name: string;
    namespace: string;
  };
}

// 命名空间分布类型
export interface NamespaceDistribution {
  name: string;
  value: number;
}

// 节点相关类型
export interface Node {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  cpuUsage: number;
  memoryUsage: number;
  pods: number;
  ip: string;
  os: string;
  kernelVersion: string;
  kubeletVersion: string;
  capacity: {
    cpu: string;
    memory: string;
    pods: string;
  };
  allocatable: {
    cpu: string;
    memory: string;
    pods: string;
  };
  labels: Record<string, string>;
  taints: Array<{
    key: string;
    value: string;
    effect: string;
  }>;
}

export interface NodeMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkReceive: number;
  networkTransmit: number;
  timestamp: string;
}

// Pod相关类型
export interface Pod {
  id: string;
  name: string;
  namespace: string;
  status: 'running' | 'succeeded' | 'failed' | 'pending' | 'paused';
  node: string;
  ip: string;
  containers: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    image: string;
  }>;
  age: string;
  cpuUsage: number;
  memoryUsage: number;
  labels: Record<string, string>;
}

export interface PodLog {
  timestamp: string;
  message: string;
  stream?: 'stdout' | 'stderr';
}

// 工作负载相关类型
export interface Deployment {
  id: string;
  name: string;
  namespace: string;
  ready: number;
  desired: number;
  available: number;
  upToDate: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  selector: Record<string, string>;
  strategy: string;
}

export interface StatefulSet {
  id: string;
  name: string;
  namespace: string;
  ready: number;
  desired: number;
  available: number;
  upToDate: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  selector: Record<string, string>;
  serviceName: string;
}

export interface DaemonSet {
  id: string;
  name: string;
  namespace: string;
  ready: number;
  desired: number;
  available: number;
  upToDate: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  selector: Record<string, string>;
}

export interface CronJob {
  id: string;
  name: string;
  namespace: string;
  schedule: string;
  lastSchedule: string;
  age: string;
  images: string[];
  labels: Record<string, string>;
}

// 命名空间类型
export interface Namespace {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  labels: Record<string, string>;
}

// AI诊断相关类型
export interface AIDiagnosisRequest {
  query: string;
  context?: Record<string, any>;
}

export interface AIDiagnosisResponse {
  id: string;
  query: string;
  response: string;
  timestamp: string;
  confidence?: number;
}

export interface DiagnosisHistory {
  id: string;
  title: string;
  date: Date;
  summary: string;
  details?: string;
}

// AI模型类型
export interface AIModel {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey?: string;
  modelType: string;
  isDefault: boolean;
}

// 设置类型
export interface SystemSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoRefreshInterval: number;
  showResourceUsage: boolean;
  showEvents: boolean;
  showNamespaceDistribution?: boolean;
  navigationPosition?: 'left' | 'top';
  notifications: {
    level: 'all' | 'critical' | 'none';
    enabledTypes: string[];
  };
}

// 分页相关类型
export interface PaginationOptions {
  page: number;
  perPage: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
