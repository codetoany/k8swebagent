import { describe, expect, it } from 'vitest';
import { canOpenNodeShell, getNodeShellUnavailableReason, isLinuxNode, normalizeNodeStatus } from '@/lib/nodes';

describe('node shell guards', () => {
  it('normalizes node status before checks', () => {
    expect(normalizeNodeStatus(' Online ')).toBe('online');
  });

  it('allows node shell only for online linux nodes', () => {
    expect(canOpenNodeShell({
      status: 'online',
      labels: { 'kubernetes.io/os': 'linux' },
    })).toBe(true);
    expect(canOpenNodeShell({
      status: 'offline',
      labels: { 'kubernetes.io/os': 'linux' },
    })).toBe(false);
    expect(canOpenNodeShell({
      status: 'online',
      labels: { 'kubernetes.io/os': 'windows' },
    })).toBe(false);
  });

  it('detects linux nodes from labels or os image', () => {
    expect(isLinuxNode({ labels: { 'kubernetes.io/os': 'linux' } })).toBe(true);
    expect(isLinuxNode({ os: 'Windows Server 2022 Datacenter' })).toBe(false);
  });

  it('explains why node shell is blocked', () => {
    expect(getNodeShellUnavailableReason({ status: 'offline' })).toContain('当前状态：offline');
    expect(getNodeShellUnavailableReason({
      status: 'online',
      labels: { 'kubernetes.io/os': 'windows' },
    })).toContain('仅支持 Linux 节点');
  });
});
