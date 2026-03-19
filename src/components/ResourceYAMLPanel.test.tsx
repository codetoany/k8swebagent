import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResourceYAMLPanel from '@/components/ResourceYAMLPanel';
import apiClient from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({
  default: {
    get: vi.fn(() => new Promise(() => {})),
  },
}));

vi.mock('@/components/YAMLTAB', () => ({
  YAMLTAB: ({ yamlStr }: { yamlStr: string }) => <pre>{yamlStr}</pre>,
}));

describe('ResourceYAMLPanel', () => {
  it('shows repaired loading copy while yaml is loading', async () => {
    render(
      <ResourceYAMLPanel
        kind="Service"
        version="v1"
        namespace="default"
        name="kubernetes"
        theme="dark"
      />,
    );

    expect(await screen.findByText('正在加载 YAML...')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalled();
  });
});
