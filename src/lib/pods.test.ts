import { describe, expect, it } from 'vitest';
import { canExecIntoPod, getPodExecUnavailableReason, normalizePodStatus } from '@/lib/pods';

describe('pod exec guards', () => {
  it('normalizes pod status before checks', () => {
    expect(normalizePodStatus(' Running ')).toBe('running');
  });

  it('allows exec only for running pods', () => {
    expect(canExecIntoPod({ status: 'running' })).toBe(true);
    expect(canExecIntoPod({ status: 'Running' })).toBe(true);
    expect(canExecIntoPod({ status: 'pending' })).toBe(false);
    expect(canExecIntoPod({ status: 'succeeded' })).toBe(false);
  });

  it('explains why exec is blocked', () => {
    expect(getPodExecUnavailableReason({ status: 'pending' })).toContain('当前状态：pending');
  });
});
