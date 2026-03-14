import React, { createContext, useContext, useEffect, useState } from 'react';
import apiClient from '@/lib/apiClient';
import { clustersAPI } from '@/lib/api';
import type { ClusterConfig } from '@/lib/clusters';

const RESOURCE_CLUSTER_STORAGE_KEY = 'k8s-agent-resource-cluster-id';

type ClusterContextType = {
  clusters: ClusterConfig[];
  enabledClusters: ClusterConfig[];
  selectedClusterId: string;
  selectedCluster: ClusterConfig | null;
  loading: boolean;
  refreshClusters: (preferredClusterId?: string) => Promise<ClusterConfig[]>;
  setSelectedClusterId: (clusterId: string) => void;
};

const ClusterContext = createContext<ClusterContextType>({
  clusters: [],
  enabledClusters: [],
  selectedClusterId: '',
  selectedCluster: null,
  loading: false,
  refreshClusters: async () => [],
  setSelectedClusterId: () => {},
});

function chooseResourceCluster(
  clusters: ClusterConfig[],
  preferredClusterId?: string,
): string {
  if (clusters.length === 0) {
    return '';
  }

  const preferred = preferredClusterId || localStorage.getItem(RESOURCE_CLUSTER_STORAGE_KEY) || '';
  if (preferred && clusters.some((cluster) => cluster.id === preferred && cluster.isEnabled)) {
    return preferred;
  }

  const defaultCluster = clusters.find((cluster) => cluster.isDefault && cluster.isEnabled);
  if (defaultCluster) {
    return defaultCluster.id;
  }

  const firstEnabledCluster = clusters.find((cluster) => cluster.isEnabled);
  return firstEnabledCluster?.id || '';
}

export function ClusterProvider({ children }: { children: React.ReactNode }) {
  const [clusters, setClusters] = useState<ClusterConfig[]>([]);
  const [selectedClusterId, setSelectedClusterIdState] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshClusters = async (preferredClusterId?: string) => {
    setLoading(true);
    try {
      const nextClusters = await apiClient.get<ClusterConfig[]>(clustersAPI.listClusters);
      setClusters(nextClusters);

      const nextSelectedClusterId = chooseResourceCluster(nextClusters, preferredClusterId);
      setSelectedClusterIdState(nextSelectedClusterId);
      if (nextSelectedClusterId) {
        localStorage.setItem(RESOURCE_CLUSTER_STORAGE_KEY, nextSelectedClusterId);
      } else {
        localStorage.removeItem(RESOURCE_CLUSTER_STORAGE_KEY);
      }

      return nextClusters;
    } finally {
      setLoading(false);
    }
  };

  const setSelectedClusterId = (clusterId: string) => {
    setSelectedClusterIdState(clusterId);
    if (clusterId) {
      localStorage.setItem(RESOURCE_CLUSTER_STORAGE_KEY, clusterId);
    } else {
      localStorage.removeItem(RESOURCE_CLUSTER_STORAGE_KEY);
    }
  };

  useEffect(() => {
    void refreshClusters();
  }, []);

  const enabledClusters = clusters.filter((cluster) => cluster.isEnabled);
  const selectedCluster =
    clusters.find((cluster) => cluster.id === selectedClusterId) ||
    enabledClusters.find((cluster) => cluster.isDefault) ||
    enabledClusters[0] ||
    null;

  return (
    <ClusterContext.Provider
      value={{
        clusters,
        enabledClusters,
        selectedClusterId: selectedCluster?.id || '',
        selectedCluster,
        loading,
        refreshClusters,
        setSelectedClusterId,
      }}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export function useClusterContext() {
  return useContext(ClusterContext);
}
