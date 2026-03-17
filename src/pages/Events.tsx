import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronDown, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useClusterContext } from '@/contexts/clusterContext';
import apiClient from '@/lib/apiClient';
import { eventsAPI, namespacesAPI } from '@/lib/api';
import PageLayout from '@/components/PageLayout';
import TablePagination from '@/components/TablePagination';

const EVENT_TYPES = ['全部', 'Normal', 'Warning'];

const Events = () => {
  const { theme } = useThemeContext();
  const { selectedCluster } = useClusterContext();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [nsOpts, setNsOpts] = useState(['全部']);
  const [search, setSearch] = useState('');
  const [selNs, setSelNs] = useState('全部');
  const [selType, setSelType] = useState('全部');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(15);
  const cp = selectedCluster?.id ? { clusterId: selectedCluster.id } : undefined;

  useEffect(() => {
    let a = true;
    (async () => {
      setLoading(true);
      try {
        const [list, nsList] = await Promise.all([
          apiClient.get<any[]>(eventsAPI.list, { params: { ...cp, namespace: selNs !== '全部' ? selNs : undefined, type: selType !== '全部' ? selType : undefined } }),
          apiClient.get<any[]>(namespacesAPI.listNamespaces, { params: cp }),
        ]);
        if (!a) return;
        setEvents(Array.isArray(list) ? list : []);
        setNsOpts(Array.isArray(nsList) ? ['全部', ...nsList.map(x => x.name)] : ['全部']);
      } finally { if (a) setLoading(false); }
    })();
    return () => { a = false; };
  }, [selectedCluster?.id, selNs, selType]);

  useEffect(() => { setPage(1); }, [search, selNs, selType, size]);

  const filtered = events.filter(e => {
    const ms = e.message?.toLowerCase().includes(search.toLowerCase()) || 
               e.involvedObject?.name?.toLowerCase().includes(search.toLowerCase()) ||
               e.reason?.toLowerCase().includes(search.toLowerCase());
    return ms;
  });
  
  const paged = filtered.slice((page - 1) * size, page * size);

  const typeIcon = (t: string) => {
    if (t === 'Warning') return <AlertTriangle size={16} className="text-yellow-500" />;
    if (t === 'Error') return <AlertCircle size={16} className="text-red-500" />;
    if (t === 'Success') return <CheckCircle size={16} className="text-green-500" />;
    return <Info size={16} className="text-blue-500" />;
  };

  return (
    <PageLayout title="集群事件 (Events)" activePath="/events">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1">集群事件记录</h2>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>共 {events.length} 条记录（最近的系统事件）</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`relative md:w-64 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="搜索消息、对象或原因..." className={`w-full pl-9 pr-3 py-2 text-sm focus:outline-none bg-transparent ${theme === 'dark' ? 'text-white' : ''}`} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className={`pl-3 pr-8 py-2 rounded-lg text-sm ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} border-0`} value={selType} onChange={e => setSelType(e.target.value)}>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t === '全部' ? '所有类型' : t}</option>)}
          </select>
          <select className={`pl-3 pr-8 py-2 rounded-lg text-sm ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} border-0`} value={selNs} onChange={e => setSelNs(e.target.value)}>
            {nsOpts.map(ns => <option key={ns}>{ns}</option>)}
          </select>
        </div>
      </div>

      <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border shadow-sm`}>
        <div className="overflow-x-auto">
          {loading ? (
            <div className={`p-5 animate-pulse space-y-4`}>{[1,2,3,4,5].map(i => <div key={i} className={`h-12 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />)}</div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <table className="w-full">
                <thead><tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                  {['类型','原因','对象','消息','发生时间（最近）','次数'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                </tr></thead>
                <tbody>
                  {paged.map((item: any) => (
                    <tr key={item.id} className={`border-b ${theme === 'dark' ? 'border-gray-700 hover:bg-gray-750' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <td className="px-4 py-3 text-sm font-medium flex items-center gap-2">{typeIcon(item.type)} {item.type}</td>
                      <td className="px-4 py-3 text-sm">{item.reason}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-mono text-xs">{item.involvedObject?.kind}</div>
                        <div className="text-gray-500 mt-0.5">{item.involvedObject?.namespace}/{item.involvedObject?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm max-w-md truncate" title={item.message}>{item.message}</td>
                      <td className="px-4 py-3 text-sm">{item.lastTimestamp}</td>
                      <td className="px-4 py-3 text-sm font-mono">{item.count}</td>
                    </tr>
                  ))}
                  {paged.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">暂无数据</td></tr>}
                </tbody>
              </table>
            </motion.div>
          )}
        </div>
        {!loading && <TablePagination currentPage={page} totalItems={filtered.length} pageSize={size} onPageChange={setPage} onPageSizeChange={setSize} />}
      </div>
    </PageLayout>
  );
};
export default Events;
