type PodExecCandidate = {
  status?: string | null;
};

export const normalizePodStatus = (status?: string | null) => (status ?? '').trim().toLowerCase();

export const canExecIntoPod = (pod?: PodExecCandidate | null) => normalizePodStatus(pod?.status) === 'running';

export const getPodExecUnavailableReason = (pod?: PodExecCandidate | null) => {
  const status = normalizePodStatus(pod?.status);
  if (!status) {
    return '仅运行中的 Pod 支持进入终端。';
  }

  return `仅运行中的 Pod 支持进入终端，当前状态：${status}。`;
};
