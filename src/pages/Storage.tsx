import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpDown,
  CheckCircle,
  ChevronDown,
  Clock,
  HardDrive,
  Search,
} from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import apiClient from '@/lib/apiClient';
import { namespacesAPI, storageAPI } from '@/lib/api';
import PageLayout from '@/components/PageLayout';
import TablePagination from '@/components/TablePagination';

type StorageTab = 'pvcs' | 'pvs' | 'storageclasses';

interface StorageDataState {
  pvcs: any[];
  pvs: any[];
  storageclasses: any[];
}

const TABS: Array<{ id: StorageTab; label: string }> = [
  { id: 'pvcs', label: 'PVC' },
  { id: 'pvs', label: 'PV' },
  { id: 'storageclasses', label: '存储类' },
];

const DEFAULT_NAMESPACE = '全部';

const Storage = () => {
  const { theme } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const [activeTab, setActiveTab] = useState<StorageTab>('pvcs');
  const [loading, setLoading] = useState(false);
  const [storageData, setStorageData] = useState<StorageDataState>({
    pvcs: [],
    pvs: [],
    storageclasses: [],
  });
  const [namespaceOptions, setNamespaceOptions] = useState<string[]>([DEFAULT_NAMESPACE]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState(DEFAULT_NAMESPACE);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'ascending' | 'descending';
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const clusterParams = selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [pvcs, pvs, storageClasses, namespaces] = await Promise.all([
          apiClient.get<any[]>(storageAPI.listPVCs, clusterParams),
          apiClient.get<any[]>(storageAPI.listPVs, clusterParams),
          apiClient.get<any[]>(storageAPI.listStorageClasses, clusterParams),
          apiClient.get<Array<{ name: string }>>(namespacesAPI.listNamespaces, clusterParams),
        ]);

        if (!active) {
          return;
        }

        setStorageData({
          pvcs: Array.isArray(pvcs) ? pvcs : [],
          pvs: Array.isArray(pvs) ? pvs : [],
          storageclasses: Array.isArray(storageClasses) ? storageClasses : [],
        });

        const nextNamespaces = Array.isArray(namespaces)
          ? [DEFAULT_NAMESPACE, ...namespaces.map((item) => item.name)]
          : [DEFAULT_NAMESPACE];
        setNamespaceOptions(nextNamespaces);
        setSelectedNamespace((current) =>
          nextNamespaces.includes(current) ? current : DEFAULT_NAMESPACE,
        );
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
  }, [selectedCluster?.id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, selectedNamespace, sortConfig, pageSize]);

  const activeList = useMemo(() => storageData[activeTab] || [], [activeTab, storageData]);

  const filteredItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return activeList
      .filter((item) => {
        const matchesKeyword =
          !keyword ||
          item.name?.toLowerCase().includes(keyword) ||
          item.namespace?.toLowerCase().includes(keyword) ||
          item.storageClassName?.toLowerCase().includes(keyword) ||
          item.provisioner?.toLowerCase().includes(keyword) ||
          item.claim?.toLowerCase().includes(keyword);

        const matchesNamespace =
          activeTab !== 'pvcs' ||
          selectedNamespace === DEFAULT_NAMESPACE ||
          item.namespace === selectedNamespace;

        return matchesKeyword && matchesNamespace;
      })
      .sort((a, b) => {
        if (!sortConfig) {
          return 0;
        }

        const left = a[sortConfig.key] ?? '';
        const right = b[sortConfig.key] ?? '';

        if (left < right) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (left > right) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
  }, [activeList, activeTab, searchTerm, selectedNamespace, sortConfig]);

  const pagedItems = filteredItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';

    if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }

    setSortConfig({ key, direction });
  };

  const renderStatus = (status: string) => {
    if (status === 'Bound' || status === 'Available') {
      return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle size={10} className="mr-1" />
          {status}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
        <Clock size={10} className="mr-1" />
        {status || '-'}
      </span>
    );
  };

  const renderPVCView = () => (
    <table className="w-full">
      <thead>
        <tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {[
            ['name', '名称'],
            ['namespace', '命名空间'],
            ['status', '状态'],
            ['capacity', '容量'],
            ['accessModes', '访问模式'],
            ['storageClassName', '存储类'],
            ['age', '创建时间'],
          ].map(([key, label]) => (
            <th
              key={key}
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              <div
                className="flex items-center cursor-pointer"
                onClick={() => handleSort(key)}
              >
                <span>{label}</span>
                <ArrowUpDown size={14} className="ml-1" />
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pagedItems.map((item) => (
          <tr
            key={item.id}
            className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}
          >
            <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
            <td className="px-4 py-3 text-sm">
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {item.namespace}
              </span>
            </td>
            <td className="px-4 py-3">{renderStatus(item.status)}</td>
            <td className="px-4 py-3 text-sm">{item.capacity || '-'}</td>
            <td className="px-4 py-3 text-sm font-mono text-xs">
              {item.accessModes?.join(', ') || '-'}
            </td>
            <td className="px-4 py-3 text-sm">{item.storageClassName || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.age || '-'}</td>
          </tr>
        ))}
        {pagedItems.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
              暂无 PVC 数据
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );

  const renderPVView = () => (
    <table className="w-full">
      <thead>
        <tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {[
            ['name', '名称'],
            ['status', '状态'],
            ['capacity', '容量'],
            ['accessModes', '访问模式'],
            ['reclaimPolicy', '回收策略'],
            ['storageClassName', '存储类'],
            ['claim', '绑定声明'],
            ['age', '创建时间'],
          ].map(([key, label]) => (
            <th
              key={key}
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              <div
                className="flex items-center cursor-pointer"
                onClick={() => handleSort(key)}
              >
                <span>{label}</span>
                <ArrowUpDown size={14} className="ml-1" />
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pagedItems.map((item) => (
          <tr
            key={item.id}
            className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}
          >
            <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
            <td className="px-4 py-3">{renderStatus(item.status)}</td>
            <td className="px-4 py-3 text-sm">{item.capacity || '-'}</td>
            <td className="px-4 py-3 text-sm font-mono text-xs">
              {item.accessModes?.join(', ') || '-'}
            </td>
            <td className="px-4 py-3 text-sm">{item.reclaimPolicy || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.storageClassName || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.claim || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.age || '-'}</td>
          </tr>
        ))}
        {pagedItems.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
              暂无 PV 数据
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );

  const renderStorageClassView = () => (
    <table className="w-full">
      <thead>
        <tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {[
            ['name', '名称'],
            ['provisioner', '提供器'],
            ['reclaimPolicy', '回收策略'],
            ['volumeBindingMode', '绑定模式'],
            ['isDefault', '默认'],
            ['age', '创建时间'],
          ].map(([key, label]) => (
            <th
              key={key}
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
            >
              <div
                className="flex items-center cursor-pointer"
                onClick={() => handleSort(key)}
              >
                <span>{label}</span>
                <ArrowUpDown size={14} className="ml-1" />
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pagedItems.map((item) => (
          <tr
            key={item.id}
            className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}
          >
            <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
            <td className="px-4 py-3 text-sm">{item.provisioner || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.reclaimPolicy || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.volumeBindingMode || '-'}</td>
            <td className="px-4 py-3 text-sm">
              {item.isDefault ? (
                <span className="text-green-500">是</span>
              ) : (
                <span className="text-gray-400">否</span>
              )}
            </td>
            <td className="px-4 py-3 text-sm">{item.age || '-'}</td>
          </tr>
        ))}
        {pagedItems.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
              暂无存储类数据
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );

  const renderTable = () => {
    if (activeTab === 'pvcs') {
      return renderPVCView();
    }

    if (activeTab === 'pvs') {
      return renderPVView();
    }

    return renderStorageClassView();
  };

  return (
    <PageLayout title="存储管理" activePath="/storage">
      <div
        className={`mb-6 inline-flex rounded-lg border p-1 ${
          theme === 'dark'
            ? 'border-gray-700 bg-gray-800'
            : 'border-gray-100 bg-white shadow-sm'
        }`}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? theme === 'dark'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-700'
                : theme === 'dark'
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab.label} ({storageData[tab.id].length})
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
            <HardDrive size={20} />
            Kubernetes 存储
          </h2>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            统一查看 PVC、PV 和 StorageClass 资源。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`relative md:w-64 ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            } rounded-lg`}
          >
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索名称、命名空间或存储类..."
              className={`w-full bg-transparent py-2 pl-9 pr-3 text-sm focus:outline-none ${
                theme === 'dark' ? 'text-white' : ''
              }`}
            />
          </div>
          {activeTab === 'pvcs' ? (
            <div className="relative">
              <select
                value={selectedNamespace}
                onChange={(event) => setSelectedNamespace(event.target.value)}
                className={`appearance-none rounded-lg border py-2 pl-3 pr-8 text-sm focus:outline-none ${
                  theme === 'dark'
                    ? 'border-gray-600 bg-gray-700 text-white'
                    : 'border-gray-200 bg-gray-100'
                }`}
              >
                {namespaceOptions.map((namespace) => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={14}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-xl border shadow-sm ${
          theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'
        }`}
      >
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-4 p-5 animate-pulse">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className={`h-14 rounded ${
                    theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                {renderTable()}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {!loading ? (
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredItems.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </div>
    </PageLayout>
  );
};

export default Storage;
