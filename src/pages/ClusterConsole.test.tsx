import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClusterConsole from '@/pages/ClusterConsole';
import { clusterConsoleAPI, namespacesAPI } from '@/lib/api';

const mocked = vi.hoisted(() => ({
  apiGet: vi.fn(),
  terminalClear: vi.fn(),
  terminalWrite: vi.fn(),
  terminalWriteln: vi.fn(),
  terminalFocus: vi.fn(),
  terminalOpen: vi.fn(),
  terminalLoadAddon: vi.fn(),
  terminalDispose: vi.fn(),
  terminalOnData: vi.fn(),
  fitAddonFit: vi.fn(),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    cols: 120,
    rows: 32,
    options: {},
    loadAddon: mocked.terminalLoadAddon,
    open: mocked.terminalOpen,
    clear: mocked.terminalClear,
    write: mocked.terminalWrite,
    writeln: mocked.terminalWriteln,
    focus: mocked.terminalFocus,
    dispose: mocked.terminalDispose,
    onData: mocked.terminalOnData.mockImplementation(() => ({ dispose: vi.fn() })),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: mocked.fitAddonFit,
  })),
}));

vi.mock('@/components/PageLayout', () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('@/contexts/themeContext', () => ({
  useThemeContext: () => ({ theme: 'dark' }),
}));

vi.mock('@/contexts/clusterContext', () => ({
  useClusterContext: () => ({
    selectedCluster: { id: 'cluster-1', name: 'Demo Cluster' },
  }),
}));

vi.mock('@/lib/apiClient', () => ({
  default: {
    get: mocked.apiGet,
  },
  buildWebSocketUrl: (endpoint: string, params?: Record<string, string | number | boolean>) => {
    const url = new URL(`ws://example.test/api${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    }
    return url.toString();
  },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.clearAllMocks();
  vi.stubGlobal('WebSocket', MockWebSocket);
  mocked.apiGet.mockImplementation(async (endpoint: string) => {
    if (endpoint === clusterConsoleAPI.meta) {
      return {
        enabled: true,
        adminOnly: true,
        sessionTimeoutSeconds: 1800,
        shellPath: '/bin/sh',
        kubectlPath: 'kubectl',
        shellAvailable: true,
        kubectlAvailable: true,
      };
    }
    if (endpoint === namespacesAPI.listNamespaces) {
      return [{ name: 'default' }, { name: 'kube-system' }];
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  });
});

afterEach(() => {
  cleanup();
});

describe('ClusterConsole', () => {
  it('connects to cluster console websocket with cluster and namespace context', async () => {
    render(<ClusterConsole />);

    expect(screen.getByText('集群命令台')).toBeInTheDocument();

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    expect(MockWebSocket.instances[0].url).toContain('/api/cluster-console/ws');
    expect(MockWebSocket.instances[0].url).toContain('clusterId=cluster-1');
    expect(MockWebSocket.instances[0].url).toContain('namespace=default');

    MockWebSocket.instances[0].emitOpen();
    MockWebSocket.instances[0].emitMessage({
      type: 'ready',
      message: 'Connected to cluster Demo Cluster (namespace: default)',
    });

    await waitFor(() => {
      expect(screen.getByText('已连接到 Demo Cluster · default')).toBeInTheDocument();
    });
  });

  it('does not open websocket when console is disabled', async () => {
    mocked.apiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === clusterConsoleAPI.meta) {
        return {
          enabled: false,
          adminOnly: true,
          sessionTimeoutSeconds: 1800,
          shellPath: '/bin/sh',
          kubectlPath: 'kubectl',
          shellAvailable: true,
          kubectlAvailable: true,
          message: '集群命令台未启用',
        };
      }
      if (endpoint === namespacesAPI.listNamespaces) {
        return [{ name: 'default' }];
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    render(<ClusterConsole />);

    await waitFor(() => {
      expect(screen.getByText('集群命令台未启用')).toBeInTheDocument();
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
