import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronDown, ArrowUpDown, X, Trash2, Eye } from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import { toast } from 'sonner';
import apiClient from '@/lib/apiClient';
import { ingressesAPI, namespacesAPI, replacePathParams } from '@/lib/api';
import PageLayout from '@/components/PageLayout';
import TablePagination from '@/components/TablePagination';

const Ingresses = () => {
  const { theme } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const [loading, setLoading] = useState(false);
  const [ingresses, setIngresses] = useState<any[]>([]);
  const [namespaceOptions, setNamespaceOptions] = useState(['全部']);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('全部');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const clusterParams = selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [list, nsList] = await Promise.all([
          apiClient.get<any[]>(ingressesAPI.list, clusterParams),
          apiClient.get<Array<{ name: string }>>(namespacesAPI.listNamespaces, clusterParams),
        ]);
        if (!active) return;
        if (Array.isArray(list)) { setIngresses(list); setSelectedItem(null); }
        const ns = Array.isArray(nsList) ? ['全部', ...nsList.map(n => n.name)] : ['全部'];
        setNamespaceOptions(ns);
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [selectedCluster?.id]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedNamespace, sortConfig, pageSize]);

  const handleDelete = async (item: any) => {
    if (!window.confirm(`确认删除 Ingress "${item.namespace}/${item.name}" 吗？`)) return;
    try {
      await apiClient.delete(replacePathParams(ingressesAPI.delete, { namespace: item.namespace, name: item.name }), { params: clusterParams });
      setIngresses(c => c.filter(s => s.id !== item.id));
      if (selectedItem?.id === item.id) setSelectedItem(null);
      toast.success(`Ingress ${item.name} 已删除`);
    } catch { toast.error('删除失败'); }
  };

  const handleSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig?.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
  };

  const filtered = ingresses
    .filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchNs = selectedNamespace === '全部' || s.namespace === selectedNamespace;
      return matchSearch && matchNs;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });

  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getHosts = (item: any) => {
    if (!item.rules || item.rules.length === 0) return '-';
    return item.rules.map((r: any) => r.host || '*').join(', ');
  };

  return (
    <PageLayout title="Ingresses 管理" activePath="/ingresses">
      {loading ? (
        <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm animate-pulse`}>
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className={`h-14 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />)}</div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Kubernetes Ingresses</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>共 {ingresses.length} 个 Ingress</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`relative md:w-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg overflow-hidden`}>
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} size={16} />
                <input type="text" placeholder="搜索..." className={`w-full pl-9 pr-3 py-2 text-sm focus:outline-none ${theme === 'dark' ? 'bg-transparent text-white' : 'bg-transparent'}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="relative">
                <select className={`appearance-none pl-3 pr-8 py-2 rounded-lg text-sm focus:outline-none ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200'} border`} value={selectedNamespace} onChange={e => setSelectedNamespace(e.target.value)}>
                  {namespaceOptions.map(ns => <option key={ns} value={ns}>{ns}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              </div>
            </div>
          </div>

          <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                    {[['name','名称'],['namespace','命名空间'],['ingressClass','IngressClass'],['hosts','主机'],['tls','TLS'],['age','创建时间']].map(([key, label]) => (
                      <th key={key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div className="flex items-center cursor-pointer" onClick={() => handleSort(key)}><span>{label}</span><ArrowUpDown size={14} className="ml-1" /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => (
                    <tr key={item.id} className={`border-b ${theme === 'dark' ? 'border-gray-700 hover:bg-gray-750' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer`} onClick={() => setSelectedItem(item)}>
                      <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-sm"><span className={`px-2 py-0.5 rounded text-xs ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>{item.namespace}</span></td>
                      <td className="px-4 py-3 text-sm">{item.ingressClass || '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono text-xs">{getHosts(item)}</td>
                      <td className="px-4 py-3 text-sm">{item.tls?.length > 0 ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">已启用</span> : <span className="text-gray-400">-</span>}</td>
                      <td className="px-4 py-3 text-sm">{item.age}</td>
                      <td className="px-4 py-3 text-sm" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center space-x-2">
                          <button onClick={() => setSelectedItem(item)} className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}><Eye size={14} /></button>
                          <button onClick={() => void handleDelete(item)} className={`p-1.5 rounded text-red-500 ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">暂无数据</td></tr>}
                </tbody>
              </table>
            </div>
            <TablePagination currentPage={currentPage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
          </div>

          {selectedItem && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme === 'dark' ? 'bg-black/50' : 'bg-black/20'}`} onClick={() => setSelectedItem(null)}>
              <div className={`w-full max-w-2xl rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-xl max-h-[80vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-700 flex justify-between items-center">
                  <h3 className="text-lg font-bold">Ingress 详情: {selectedItem.name}</h3>
                  <button className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`} onClick={() => setSelectedItem(null)}><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[['命名空间', selectedItem.namespace], ['IngressClass', selectedItem.ingressClass || '-'], ['创建时间', selectedItem.age]].map(([label, value]) => (
                      <div key={label as string}><p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p><p className="font-medium text-sm">{value as string}</p></div>
                    ))}
                  </div>
                  {selectedItem.rules?.length > 0 && (
                    <div>
                      <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>路由规则</h4>
                      {selectedItem.rules.map((rule: any, i: number) => (
                        <div key={i} className={`mb-2 p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                          <p className="text-sm font-medium mb-1">{rule.host || '*'}</p>
                          {rule.paths?.map((path: any, j: number) => (
                            <div key={j} className="text-xs font-mono ml-2">{path.path} ({path.pathType}) → {path.backend?.serviceName}:{path.backend?.servicePort}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedItem.tls?.length > 0 && (
                    <div>
                      <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>TLS 配置</h4>
                      {selectedItem.tls.map((tls: any, i: number) => (
                        <div key={i} className="text-sm">Secret: <span className="font-mono">{tls.secretName}</span> → {tls.hosts?.join(', ')}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </PageLayout>
  );
};

export default Ingresses;
