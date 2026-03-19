type NodeShellCandidate = {
  status?: string | null;
  os?: string | null;
  labels?: Record<string, string> | null;
};

export const normalizeNodeStatus = (status?: string | null) => (status ?? '').trim().toLowerCase();

export const isLinuxNode = (node?: NodeShellCandidate | null) => {
  const labelOS = (node?.labels?.['kubernetes.io/os'] ?? '').trim().toLowerCase();
  if (labelOS) {
    return labelOS === 'linux';
  }

  const osName = (node?.os ?? '').trim().toLowerCase();
  if (!osName) {
    return true;
  }

  return !osName.includes('windows');
};

export const canOpenNodeShell = (node?: NodeShellCandidate | null) =>
  normalizeNodeStatus(node?.status) === 'online' && isLinuxNode(node);

export const getNodeShellUnavailableReason = (node?: NodeShellCandidate | null) => {
  const status = normalizeNodeStatus(node?.status);
  if (status && status !== 'online') {
    return `仅在线 Linux 节点支持进入终端，当前状态：${status}。`;
  }

  if (!isLinuxNode(node)) {
    return '节点终端当前仅支持 Linux 节点。';
  }

  return '仅在线 Linux 节点支持进入终端。';
};
