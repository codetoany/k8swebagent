import { useEffect, useState } from 'react';
import apiClient from '@/lib/apiClient';
import { yamlAPI } from '@/lib/api';
import { YAMLTAB } from '@/components/YAMLTAB';

type ResourceYAMLPanelProps = {
  clusterId?: string;
  kind: string;
  version: string;
  namespace?: string;
  name: string;
  theme: string;
};

type YAMLResponse = {
  yaml: string;
};

const ResourceYAMLPanel = ({
  clusterId,
  kind,
  version,
  namespace,
  name,
  theme,
}: ResourceYAMLPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [yaml, setYaml] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<YAMLResponse>(yamlAPI.get, {
          kind,
          version,
          namespace: namespace ?? '',
          name,
          ...(clusterId ? { clusterId } : {}),
        });
        if (!active) {
          return;
        }
        setYaml(response?.yaml ?? '');
      } catch {
        if (active) {
          setYaml('');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [clusterId, kind, version, namespace, name]);

  if (loading) {
    return <p className="text-sm text-gray-400">正在加载 YAML...</p>;
  }

  return <YAMLTAB yamlStr={yaml} theme={theme} />;
};

export default ResourceYAMLPanel;
