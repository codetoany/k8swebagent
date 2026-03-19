import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronDown, X, Eye, Lock } from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import apiClient from '@/lib/apiClient';
import { secretsAPI, namespacesAPI, replacePathParams } from '@/lib/api';
import PageLayout from '@/components/PageLayout';
import TablePagination from '@/components/TablePagination';
import ResourceYAMLPanel from '@/components/ResourceYAMLPanel';

const Secrets = () => {
  const { theme } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const [loading, setLoading] = useState(false);
  const [secrets, setSecrets] = useState<any[]>([]);
  const [nsOpts, setNsOpts] = useState(['全部']);
  const [search, setSearch] = useState('');
  const [selNs, setSelNs] = useState('全部');
  const [selItem, setSelItem] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const cp = selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined;

  useEffect(() => {
    let a = true;
    (async () => {
      setLoading(true);
      try {
        const [l, n] = await Promise.all([
          apiClient.get<any[]>(secretsAPI.list, cp),
          apiClient.get<any[]>(namespacesAPI.listNamespaces, cp),
        ]);
        if (!a) return;
        if (Array.isArray(l)) { setSecrets(l); setSelItem(null); }
        setNsOpts(Array.isArray(n) ? ['全部', ...n.map(x => x.name)] : ['全部']);
      } finally { if (a) setLoading(false); }
    })();
    return () => { a = false; };
  }, [selectedCluster?.id]);

  useEffect(() => { setPage(1); }, [search, selNs, size]);

  const viewDetail = async (item: any) => {
    setSelItem(item);
    try {
      const d = await apiClient.get<any>(replacePathParams(secretsAPI.detail, { namespace: item.namespace, name: item.name }), cp);
      setDetail(d);
    } catch { setDetail(null); }
  };

  const list = secrets.filter(s => {
    const ms = s.name.toLowerCase().includes(search.toLowerCase());
    return ms && (selNs === '全部' || s.namespace === selNs);
  });
  const paged = list.slice((page - 1) * size, page * size);

  return (
    <PageLayout title="Secrets 管理" activePath="/secrets">
      {loading ? (
        <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} animate-pulse`}>
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className={`h-14 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />)}</div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Kubernetes Secrets</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>共 {secrets.length} 个（只读，值已脱敏）</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`relative md:w-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg`}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type="text" placeholder="搜索..." className={`w-full pl-9 pr-3 py-2 text-sm focus:outline-none bg-transparent ${theme === 'dark' ? 'text-white' : ''}`} value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className={`pl-3 pr-8 py-2 rounded-lg text-sm ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} border-0`} value={selNs} onChange={e => setSelNs(e.target.value)}>
                {nsOpts.map(ns => <option key={ns}>{ns}</option>)}
              </select>
            </div>
          </div>
          <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border shadow-sm`}>
            <table className="w-full">
              <thead><tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                {['名称','命名空间','类型','数据项','创建时间','操作'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {paged.map(item => (
                  <tr key={item.id} className={`border-b cursor-pointer ${theme === 'dark' ? 'border-gray-700 hover:bg-gray-750' : 'border-gray-100 hover:bg-gray-50'}`} onClick={() => void viewDetail(item)}>
                    <td className="px-4 py-3 text-sm font-medium flex items-center gap-1.5"><Lock size={12} className="text-yellow-500" />{item.name}</td>
                    <td className="px-4 py-3 text-sm"><span className={`px-2 py-0.5 rounded text-xs ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>{item.namespace}</span></td>
                    <td className="px-4 py-3 text-xs font-mono">{item.type}</td>
                    <td className="px-4 py-3 text-sm">{item.dataCount}</td>
                    <td className="px-4 py-3 text-sm">{item.age}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}><button onClick={() => void viewDetail(item)} className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}><Eye size={14} /></button></td>
                  </tr>
                ))}
                {paged.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">暂无数据</td></tr>}
              </tbody>
            </table>
            <TablePagination currentPage={page} totalItems={list.length} pageSize={size} onPageChange={setPage} onPageSizeChange={setSize} />
          </div>
          {selItem && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme === 'dark' ? 'bg-black/50' : 'bg-black/20'}`} onClick={() => { setSelItem(null); setDetail(null); }}>
              <div className={`w-full max-w-2xl rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-xl max-h-[80vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-700 flex justify-between"><h3 className="text-lg font-bold">Secret: {selItem.name}</h3><button onClick={() => { setSelItem(null); setDetail(null); }}><X size={20} /></button></div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[['命名空间', selItem.namespace],['类型', selItem.type],['数据项', selItem.dataCount],['创建时间', selItem.age]].map(([l,v]) => <div key={l as string}><p className="text-xs text-gray-400">{l}</p><p className="text-sm font-medium">{String(v)}</p></div>)}
                  </div>
                  {detail?.dataKeys?.length > 0 && <div><h4 className="text-sm font-medium text-gray-400 mb-2">键名（值已脱敏）</h4><div className="flex flex-wrap gap-2">{detail.dataKeys.map((k: string) => <span key={k} className={`px-2.5 py-1 rounded text-xs font-mono ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>{k}: ••••••</span>)}</div></div>}
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">YAML</h4>
                    <ResourceYAMLPanel
                      clusterId={selectedCluster?.id}
                      kind="Secret"
                      version="v1"
                      namespace={selItem.namespace}
                      name={selItem.name}
                      theme={theme}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </PageLayout>
  );
};
export default Secrets;
