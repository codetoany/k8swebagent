import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AccessDenied, ProtectedRoute } from '@/App';
import type { UserInfo } from '@/lib/types';

const viewer: UserInfo = {
  id: 'viewer-1',
  username: 'viewer',
  email: 'viewer@example.com',
  role: 'viewer',
  permissions: ['pods:read'],
};

describe('App guard copy', () => {
  it('renders repaired access denied copy', () => {
    render(<AccessDenied />);

    expect(screen.getByText('无权访问')).toBeInTheDocument();
    expect(screen.getByText('当前账号没有访问该页面的权限，请联系管理员分配权限。')).toBeInTheDocument();
  });

  it('renders repaired loading copy', () => {
    render(
      <ProtectedRoute isAuthenticated authLoading currentUser={viewer}>
        <div>内容</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('正在校验登录状态...')).toBeInTheDocument();
  });

  it('blocks users without permission', () => {
    render(
      <MemoryRouter>
        <ProtectedRoute
          isAuthenticated
          authLoading={false}
          currentUser={viewer}
          permission="services:read"
        >
          <div>不会显示</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('无权访问')).not.toHaveLength(0);
    expect(screen.queryByText('不会显示')).not.toBeInTheDocument();
  });
});
