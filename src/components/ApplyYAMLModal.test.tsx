import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ApplyYAMLModal from '@/components/ApplyYAMLModal';
import apiClient from '@/lib/apiClient';
import { toast } from 'sonner';

vi.mock('@/lib/apiClient', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ApplyYAMLModal', () => {
  it('renders repaired copy and applies example yaml', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      kind: 'ConfigMap',
      name: 'my-config',
      namespace: 'default',
      action: 'created',
    });

    render(<ApplyYAMLModal theme="light" onClose={vi.fn()} />);

    expect(screen.getByText('应用 YAML 资源')).toBeInTheDocument();
    expect(screen.getByText('示例')).toBeInTheDocument();
    expect(screen.getByText('复制')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '示例' }));
    fireEvent.click(screen.getByRole('button', { name: '应用' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('ConfigMap/my-config 已创建');
    });
  });
});
