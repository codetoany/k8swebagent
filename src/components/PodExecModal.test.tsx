import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PodExecModal from '@/components/PodExecModal';

const terminalClear = vi.fn();
const terminalWrite = vi.fn();
const terminalWriteln = vi.fn();
const terminalFocus = vi.fn();
const terminalOpen = vi.fn();
const terminalLoadAddon = vi.fn();
const terminalDispose = vi.fn();
const terminalOnData = vi.fn();
const fitAddonFit = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    cols: 120,
    rows: 32,
    options: {},
    loadAddon: terminalLoadAddon,
    open: terminalOpen,
    clear: terminalClear,
    write: terminalWrite,
    writeln: terminalWriteln,
    focus: terminalFocus,
    dispose: terminalDispose,
    onData: terminalOnData.mockImplementation(() => ({ dispose: vi.fn() })),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: fitAddonFit,
  })),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
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
  localStorage.clear();
  localStorage.setItem('authToken', 'token-123');
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  cleanup();
});

describe('PodExecModal', () => {
  it('connects to websocket terminal and displays ready state', async () => {
    render(
      <PodExecModal
        pod={{ namespace: 'default', name: 'demo-pod', containers: [{ name: 'main' }] }}
        theme="dark"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Pod 交互终端')).toBeInTheDocument();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain('/api/pods/default/demo-pod/exec');
    expect(MockWebSocket.instances[0].url).toContain('access_token=token-123');
    expect(MockWebSocket.instances[0].url).toContain('container=main');

    MockWebSocket.instances[0].emitOpen();
    MockWebSocket.instances[0].emitMessage({
      type: 'ready',
      container: 'main',
      message: 'Connected to default/demo-pod',
    });

    await waitFor(() => {
      expect(screen.getByText('已连接')).toBeInTheDocument();
      expect(screen.getByText('已连接到 default/demo-pod · main')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(terminalClear).toHaveBeenCalled();
  });

  it('reconnects when reconnect button is pressed', async () => {
    render(
      <PodExecModal
        pod={{ namespace: 'default', name: 'demo-pod', containers: [{ name: 'main' }] }}
        theme="light"
        onClose={vi.fn()}
      />,
    );

    expect(MockWebSocket.instances).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('button', { name: '重新连接' })[0]);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });

  it('does not open websocket for non-running pods', async () => {
    render(
      <PodExecModal
        pod={{ namespace: 'default', name: 'pending-pod', status: 'pending', containers: [{ name: 'main' }] }}
        theme="dark"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    expect(terminalWriteln).toHaveBeenCalledWith(expect.stringContaining('Current status: pending'));
    expect(terminalWriteln).toHaveBeenCalledWith(expect.stringContaining('仅运行中的 Pod 支持进入终端'));
  });
});
