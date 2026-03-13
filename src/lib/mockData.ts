// 模拟数据生成器，用于前端开发和测试

import { 
  ClusterOverview, ResourceUsageData, ClusterEvent, NamespaceDistribution, 
  Node, Pod, Deployment, StatefulSet, DaemonSet, CronJob, Namespace,
  DiagnosisHistory, AIModel, SystemSettings
} from './types';

// 生成随机数
const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// 生成随机字符串
const randomString = (length: number = 8): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 生成日期字符串
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// 生成时间字符串
const formatTime = (date: Date): string => {
  return date.toTimeString().split(' ')[0];
};

// 生成集群概览数据
export const generateClusterOverview = (): ClusterOverview => {
  return {
    totalNodes: 6,
    onlineNodes: 5,
    offlineNodes: 1,
    totalPods: 45,
    runningPods: 40,
    failedPods: 2,
    pausedPods: 3,
    totalWorkloads: 15,
    cpuUsage: 65,
    memoryUsage: 78,
    diskUsage: 42
  };
};

// 生成资源使用数据
export const generateResourceUsageData = (): ResourceUsageData[] => {
  const now = new Date();
  const data: ResourceUsageData[] = [];
  
  // 生成过去24小时的数据
  for (let i = 23; i >= 0; i--) {
    const hour = now.getHours() - i;
    const time = hour < 0 ? `${24 + hour}:00` : `${hour}:00`;
    
    // 模拟一天内的资源使用变化趋势
    const hourOfDay = hour < 0 ? 24 + hour : hour;
    let cpuUsage = 30 + Math.sin(hourOfDay / 24 * Math.PI * 2) * 30;
    let memoryUsage = 40 + Math.cos(hourOfDay / 24 * Math.PI * 2) * 30;
    
    // 确保在合理范围内
    cpuUsage = Math.max(10, Math.min(90, cpuUsage));
    memoryUsage = Math.max(20, Math.min(85, memoryUsage));
    
    data.push({
      time,
      cpuUsage: Math.round(cpuUsage),
      memoryUsage: Math.round(memoryUsage),
      diskUsage: Math.round(30 + Math.random() * 20)
    });
  }
  
  // 添加当前时间点
  data.push({
    time: '现在',
    cpuUsage: 65,
    memoryUsage: 78,
    diskUsage: 42
  });
  
  return data;
};

// 生成最近事件
export const generateRecentEvents = (count: number = 10): ClusterEvent[] => {
  const types = ['warning', 'info', 'error', 'success'];
  const reasons = ['NodeReady', 'NodeNotReady', 'PodFailed', 'PodScheduled', 'ContainerStarted', 'ContainerStopped'];
  const kinds = ['Node', 'Pod', 'Deployment', 'StatefulSet', 'DaemonSet'];
  const namespaces = ['default', 'kube-system', 'dev', 'prod'];
  
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[randomInt(0, kinds.length - 1)];
    const name = `${kind.toLowerCase()}-${randomString(5)}`;
    const namespace = namespaces[randomInt(0, namespaces.length - 1)];
    
    // 生成过去24小时内的随机时间
    const timestamp = new Date(Date.now() - randomInt(0, 86400000)).toISOString();
    
    return {
      id: `event-${randomString()}`,
      type: types[randomInt(0, types.length - 1)] as any,
      reason: reasons[randomInt(0, reasons.length - 1)],
      message: `Event message for ${name} in namespace ${namespace}`,
      timestamp,
      involvedObject: {
        kind,
        name,
        namespace
      }
    };
  });
};

// 生成命名空间分布
export const generateNamespaceDistribution = (): NamespaceDistribution[] => {
  return [
    { name: 'default', value: 12 },
    { name: 'kube-system', value: 18 },
    { name: 'kube-public', value: 3 },
    { name: 'dev', value: 8 },
    { name: 'prod', value: 15 }
  ];
};

// 生成节点数据
export const generateNodes = (count: number = 6): Node[] => {
  return Array.from({ length: count }, (_, i) => {
    const nodeIndex = i + 1;
    const status = nodeIndex === 3 ? 'offline' : 'online';
    const cpuUsage = status === 'online' ? randomInt(25, 75) : 0;
    const memoryUsage = status === 'online' ? randomInt(35, 85) : 0;
    
    return {
      id: `node-${nodeIndex}`,
      name: `node-${nodeIndex}`,
      status,
      cpuUsage,
      memoryUsage,
      pods: status === 'online' ? randomInt(6, 12) : 8,
      ip: `192.168.1.10${nodeIndex}`,
      os: 'Ubuntu 22.04',
      kernelVersion: '5.15.0-86-generic',
      kubeletVersion: 'v1.28.0',
      capacity: {
        cpu: '8',
        memory: '32Gi',
        pods: '110'
      },
      allocatable: {
        cpu: '7.9',
        memory: '31Gi',
        pods: '110'
      },
      labels: {
        'kubernetes.io/hostname': `node-${nodeIndex}`,
        'node-role.kubernetes.io/worker': ''
      },
      taints: []
    };
  });
};

// 生成Pod数据
export const generatePods = (count: number = 45): Pod[] => {
  const statuses: ('running' | 'succeeded' | 'failed' | 'pending' | 'paused')[] = [
    'running', 'running', 'running', 'running', 'running', 
    'succeeded', 'failed', 'pending', 'paused'
  ];
  const namespaces = ['default', 'kube-system', 'dev', 'prod'];
  const apps = ['web-app', 'api-server', 'database', 'worker', 'monitoring', 'backup', 'test-app'];
  const nodes = generateNodes(6);
  
  return Array.from({ length: count }, (_, i) => {
    const status = statuses[randomInt(0, statuses.length - 1)];
    const namespace = namespaces[randomInt(0, namespaces.length - 1)];
    const app = apps[randomInt(0, apps.length - 1)];
    const node = nodes[randomInt(0, nodes.length - 1)];
    const containerCount = randomInt(1, 3);
    
    return {
      id: `${app}-${randomString(5)}`,
      name: `${app}-${randomString(5)}`,
      namespace,
      status,
      node: node.name,
      ip: `10.244.${randomInt(1, 6)}.${randomInt(10, 100)}`,
      containers: Array.from({ length: containerCount }, (_, j) => ({
        name: j === 0 ? app : `${app}-sidecar-${j}`,
        ready: status === 'running',
        restartCount: status === 'failed' ? randomInt(1, 15) : randomInt(0, 3),
        image: `${app}:v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 9)}`
      })),
      age: `${randomInt(1, 14)}d`,
      cpuUsage: status === 'running' ? randomInt(5, 80) : 0,
      memoryUsage: status === 'running' ? randomInt(128, 2048) : 0,
      labels: {
        'app': app,
        'environment': namespace
      }
    };
  });
};

// 生成Deployment数据
export const generateDeployments = (count: number = 5): Deployment[] => {
  const namespaces = ['default', 'kube-system', 'dev', 'prod'];
  const apps = ['web-app', 'api-server', 'monitoring', 'auth-service', 'cache-service'];
  
  return Array.from({ length: count }, (_, i) => {
    const namespace = namespaces[randomInt(0, namespaces.length - 1)];
    const app = apps[i % apps.length];
    const replicas = randomInt(1, 5);
    
    return {
      id: `${app}-deployment`,
      name: app,
      namespace,
      ready: replicas,
      desired: replicas,
      available: replicas,
      upToDate: replicas,
      age: `${randomInt(1, 14)}d`,
      images: [`${app}:v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 9)}`],
      labels: {
        'app': app,
        'environment': namespace
      },
      selector: {
        'app': app
      },
      strategy: 'RollingUpdate'
    };
  });
};

// 生成StatefulSet数据
export const generateStatefulSets = (count: number = 2): StatefulSet[] => {
  const namespaces = ['default', 'prod'];
  const apps = ['database', 'redis'];
  
  return Array.from({ length: count }, (_, i) => {
    const namespace = namespaces[i % namespaces.length];
    const app = apps[i % apps.length];
    const replicas = randomInt(1, 3);
    
    return {
      id: `${app}-statefulset`,
      name: app,
      namespace,
      ready: replicas,
      desired: replicas,
      available: replicas,
      upToDate: replicas,
      age: `${randomInt(7, 30)}d`,
      images: [`${app}:v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 9)}`],
      labels: {
        'app': app,
        'environment': namespace
      },
      selector: {
        'app': app
      },
      serviceName: `${app}-service`
    };
  });
};

// 生成DaemonSet数据
export const generateDaemonSets = (count: number = 2): DaemonSet[] => {
  const namespaces = ['kube-system', 'default'];
  const apps = ['worker', 'log-collector'];
  
  return Array.from({ length: count }, (_, i) => {
    const namespace = namespaces[i % namespaces.length];
    const app = apps[i % apps.length];
    
    return {
      id: `${app}-daemonset`,
      name: app,
      namespace,
      ready: 5,
      desired: 6,
      available: 5,
      upToDate: 5,
      age: `${randomInt(3, 14)}d`,
      images: [`${app}:v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 9)}`],
      labels: {
        'app': app,
        'environment': namespace
      },
      selector: {
        'app': app
      }
    };
  });
};

// 生成CronJob数据
export const generateCronJobs = (count: number = 3): CronJob[] => {
  const namespaces = ['default', 'prod', 'dev'];
  const schedules = ['0 * * * *', '0 0 * * *', '*/30 * * * *'];
  
  return Array.from({ length: count }, (_, i) => {
    const namespace = namespaces[i % namespaces.length];
    const schedule = schedules[i % schedules.length];
    
    return {
      id: `cron-job-${i}`,
      name: `backup-job-${i}`,
      namespace,
      schedule,
      lastSchedule: `${randomInt(1, 24)}h ago`,
      age: `${randomInt(7, 30)}d`,
      images: [`backup-tool:v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 9)}`],
      labels: {
        'app': 'backup',
        'schedule': schedule
      }
    };
  });
};

// 生成命名空间数据
export const generateNamespaces = (): Namespace[] => {
  const namespaces = ['default', 'kube-system', 'kube-public', 'dev', 'prod'];
  
  return namespaces.map((name, i) => ({
    id: name,
    name,
    status: 'Active',
    createdAt: formatDate(new Date(Date.now() - i * 86400000)),
    labels: i > 0 ? { 'kubernetes.io/metadata.name': name } : {}
  }));
};

// 生成诊断历史数据
export const generateDiagnosisHistory = (count: number = 5): DiagnosisHistory[] => {
  const queries = [
    '分析集群状态',
    '分析Pod失败原因',
    '提供工作负载优化建议',
    '查看节点状态',
    '解释Kubernetes概念'
  ];
  
  return Array.from({ length: count }, (_, i) => {
    const query = queries[i % queries.length];
    
    return {
      id: `history-${randomString()}`,
      title: query,
      date: new Date(Date.now() - i * 86400000),
      summary: `这是关于"${query}"的分析结果。系统状态良好，但发现了一些需要注意的问题。建议进行进一步的检查和优化。`
    };
  });
};

// 生成AI模型数据
export const generateAIModels = (): AIModel[] => {
  return [
    {
      id: 'openai-gpt4o',
      name: 'OpenAI GPT-4o',
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelType: 'openai',
      isDefault: true
    },
    {
      id: 'anthropic-claude3',
      name: 'Anthropic Claude 3',
      apiBaseUrl: 'https://api.anthropic.com/v1',
      apiKey: '',
      modelType: 'anthropic',
      isDefault: false
    }
  ];
};

// 生成系统设置数据
export const generateSystemSettings = (): SystemSettings => {
  return {
    theme: 'system',
    language: 'zh-CN',
    autoRefreshInterval: 30,
    showResourceUsage: true,
    showEvents: true,
    notifications: {
      level: 'all',
      enabledTypes: ['node', 'pod', 'workload']
    }
  };
};