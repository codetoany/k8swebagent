import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClusterSelector from '@/components/ClusterSelector';

describe('ClusterSelector', () => {
  it('shows repaired empty-state copy', () => {
    render(
      <ClusterSelector
        theme="light"
        clusters={[]}
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: '暂无可用集群' })).toBeInTheDocument();
  });
});
