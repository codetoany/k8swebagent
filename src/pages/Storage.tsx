import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, CheckCircle, Clock } from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import apiClient from '@/lib/apiClient';
import { storageAPI, namespacesAPI } from '@/lib/api';
import PageLayout from '@/components/PageLayout';
import TablePagination from '@/components/TablePagination';

const TABS = [{ id: 'pvcs', label: 'PVCs' }, { id: 'pvs', label: 'PVs' }, { id: 'storageclasses', label: 'Storage Classes' }];

const Storage = () => {
  const { theme } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const [activeTab, setActiveTab] = useState('pvcs');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ pvcs: [], pvs: [], scs: [] });
  const [nsOpts, setNsOpts] = useState(['全部']);
  const [search, setSearch] = useState('');
  const [selNs, setSelNs] = useState('全部');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const cp = selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined;

  useEffect(() => {
    let a = true;
    (async () => {
      setLoading(true);
      try {
        const [pvcs, pvs, scs, nsList] = await Promise.all([
          apiClient.get<any[]>(storageAPI.listPVCs, cp),
          apiClient.get<any[]>(storageAPI.listPVs, cp),
          apiClient.get<any[]>(storageAPI.listStorageClasses, cp),
          apiClient.get<any[]>(namespacesAPI.listNamespaces, cp),
        ]);
        if (!a) return;
        setData({ pvcs: Array.isArray(pvcs) ? pvcs : [], pvs: Array.isArray(pvs) ? pvs : [], scs: Array.isArray(scs) ? scs : [] });
        setNsOpts(Array.isArray(nsList) ? ['全部', ...nsList.map(x => x.name)] : ['全部']);
      } finally { if (a) setLoading(false); }
    })();
    return () => { a = false; };
  }, [selectedCluster?.id]);

  useEffect(() => { setPage(1); }, [activeTab, search, selNs, size]);

  const getList = () => {
    switch (activeTab) {
      case 'pvcs': return data.pvcs;
      case 'pvs': return data.pvs;
      case 'storageclasses': return data.scs;
      default: return [];
    }
  };

  const filtered = getList().filter((s: any) => {
    const ms = s.name.toLowerCase().includes(search.toLowerCase());
    if (activeTab === 'pvcs') return ms && (selNs === '全部' || s.namespace === selNs);
    return ms;
  });
  const paged = filtered.slice((page - 1) * size, page * size);

  const statusEl = (s: string) => {
    if (s === 'Bound') return <span className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle size={10} className="mr-1"/>{s}</span>;
    return <span className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"><Clock size={10} className="mr-1"/>{s}</span>;
  };

  const renderTable = () => {
    if (activeTab === 'pvcs') return (
      <table className="w-full">
        <thead><tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {['名称','命名空间','状态','容量','访问模式','StorageClass','创建时间'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
        </tr></thead>
        <tbody>
          {paged.map((item: any) => (
            <tr key={item.id} className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
              <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
              <td className="px-4 py-3 text-sm"><span className={`px-2 py-0.5 rounded text-xs ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>{item.namespace}</span></td>
              <td className="px-4 py-3">{statusEl(item.status)}</td>
              <td className="px-4 py-3 text-sm">{item.capacity || '-'}</td>
              <td className="px-4 py-3 text-sm font-mono text-xs">{item.accessModes?.join(', ')}</td>
              <td className="px-4 py-3 text-sm">{item.storageClassName || '-'}</td>
              <td className="px-4 py-3 text-sm">{item.age}</td>
            </tr>
          ))}
          {paged.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">暂无数据</td></tr>}
        </tbody>
      </table>
    );
    if (activeTab === 'pvs') return (
      <table className="w-full">
        <thead><tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {['名称','状态','容量','访问模式','回收策略','存储类','绑定声明','创建时间'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
        </tr></thead>
        <tbody>
          {paged.map((item: any) => (
            <tr key={item.id} className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
              <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
              <td className="px-4 py-3">{statusEl(item.status)}</td>
              <td className="px-4 py-3 text-sm">{item.capacity}</td>
              <td className="px-4 py-3 text-sm font-mono text-xs">{item.accessModes?.join(', ')}</td>
              <td className="px-4 py-3 text-sm">{item.reclaimPolicy}</td>
              <td className="px-4 py-3 text-sm">{item.storageClassName || '-'}</td>
              <td className="px-4 py-3 text-sm">{item.claim || '-'}</td>
              <td className="px-4 py-3 text-sm">{item.age}</td>
            </tr>
          ))}
          {paged.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">暂无数据</td></tr>}
        </tbody>
      </table>
    );
    return (
      <table className="w-full">
        <thead><tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          {['名称','提供者','回收策略','绑定模式','默认','创建时间'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
        </tr></thead>
        <tbody>
          {paged.map((item: any) => (
            <tr key={item.id} className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}>
              <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
              <td className="px-4 py-3 text-sm">{item.provisioner}</td>
              <td className="px-4 py-3 text-sm">{item.reclaimPolicy}</td>
              <td className="px-4 py-3 text-sm">{item.volumeBindingMode}</td>
              <td className="px-4 py-3 text-sm">{item.isDefault ? <span className="text-green-500">是</span> : <span className="text-gray-400">否</span>}</td>
              <td className="px-4 py-3 text-sm">{item.age}</td>
            </tr>
          ))}
          {paged.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">暂无数据</td></tr>}
        </tbody>
      </table>
    );
  };

  return (
    <PageLayout title="存储管理" activePath="/storage">
      <div className={`mb-6 flex space-x-1 p-1 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border min-w-max w-min`}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab.id ? (theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700') : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900')}`}>
            {tab.label} ({data[tab.id as keyof typeof data].length})
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className={`relative md:w-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="搜索名称..." className={`w-full pl-9 pr-3 py-2 text-sm focus:outline-none bg-transparent ${theme === 'dark' ? 'text-white' : ''}`} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {activeTab === 'pvcs' && (
            <select className={`pl-3 pr-8 py-2 rounded-lg text-sm ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} border-0`} value={selNs} onChange={e => setSelNs(e.target.value)}>
              {nsOpts.map(ns => <option key={ns}>{ns}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border shadow-sm`}>
        <div className="overflow-x-auto">
          {loading ? (
            <div className={`p-5 animate-pulse space-y-4`}>{[1,2,3].map(i => <div key={i} className={`h-14 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />)}</div>
          ) : (
            <AnimatePresence mode="wait"><motion.div key={activeTab} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>{renderTable()}</motion.div></AnimatePresence>
          )}
        </div>
        {!loading && <TablePagination currentPage={page} totalItems={filtered.length} pageSize={size} onPageChange={setPage} onPageSizeChange={setSize} />}
      </div>
    </PageLayout>
  );
};
export default Storage;
