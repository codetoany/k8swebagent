import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NodeShellModal from '@/components/NodeShellModal';
import { nodeShellAPI } from '@/lib/api';

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
    if (endpoint === nodeShellAPI.meta) {
      return {
        enabled: true,
        adminOnly: true,
        sessionTimeoutSeconds: 1800,
        namespace: 'k8s-agent-system',
        daemonSetName: 'k8s-agent-host-shell',
        podLabelSelector: 'app.kubernetes.io/name=k8s-agent-host-shell',
        containerName: 'host-shell',
        shellPath: '/bin/sh',
        commandPreview: 'nsenter -t 1 -m -u -i -n -p -- chroot /proc/1/root /bin/sh -l',
        installed: true,
        desiredPods: 3,
        readyPods: 3,
        availablePods: 3,
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  });
});

afterEach(() => {
  cleanup();
});

describe('NodeShellModal', () => {
  it('connects to node shell websocket with cluster context', async () => {
    render(
      <NodeShellModal
        node={{ name: 'node-a', status: 'online', labels: { 'kubernetes.io/os': 'linux' } }}
        clusterId="cluster-1"
        theme="dark"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('节点终端')).toBeInTheDocument();

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    expect(MockWebSocket.instances[0].url).toContain('/api/nodes/node-a/shell');
    expect(MockWebSocket.instances[0].url).toContain('clusterId=cluster-1');

    MockWebSocket.instances[0].emitOpen();
    MockWebSocket.instances[0].emitMessage({
      type: 'ready',
      message: 'Connected to node shell node-a',
    });

    await waitFor(() => {
      expect(screen.getByText('已连接到节点 node-a')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(mocked.terminalClear).toHaveBeenCalled();
  });

  it('does not open websocket when runtime is disabled', async () => {
    mocked.apiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === nodeShellAPI.meta) {
        return {
          enabled: false,
          adminOnly: true,
          sessionTimeoutSeconds: 1800,
          namespace: 'k8s-agent-system',
          daemonSetName: 'k8s-agent-host-shell',
          podLabelSelector: 'app.kubernetes.io/name=k8s-agent-host-shell',
          containerName: 'host-shell',
          shellPath: '/bin/sh',
          commandPreview: 'nsenter -t 1 -m -u -i -n -p -- chroot /proc/1/root /bin/sh -l',
          installed: false,
          desiredPods: 0,
          readyPods: 0,
          availablePods: 0,
          message: '节点终端未启用',
        };
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    render(
      <NodeShellModal
        node={{ name: 'node-a', status: 'online', labels: { 'kubernetes.io/os': 'linux' } }}
        clusterId="cluster-1"
        theme="light"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('节点终端未启用')).toBeInTheDocument();
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
