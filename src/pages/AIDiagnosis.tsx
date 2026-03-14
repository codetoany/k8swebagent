import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Server, BarChart3, Database, Network, Settings, LogOut, 
  Moon, Sun, Menu, X, Search, Bell, ChevronDown, 
  RefreshCw, PlusCircle, MoreVertical, Filter, Download,
  AlertCircle, CheckCircle, ArrowUpDown, Eye, Package, 
  MessageCircle, Brain, Zap, Clock, FileText, Send,
  History, Trash2, HelpCircle, User
} from 'lucide-react';
import { useThemeContext } from '@/contexts/themeContext';
import { useContext } from 'react';
import { AuthContext } from '@/contexts/authContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import NotificationCenter from '@/components/NotificationCenter';

// 消息类型定义
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isProcessing?: boolean;
}

// 诊断历史记录类型
interface DiagnosisHistory {
  id: string;
  title: string;
  date: Date;
  summary: string;
}

  const AIDiagnosis = () => {
    const { theme, toggleTheme } = useThemeContext();
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [diagnosisHistory, setDiagnosisHistory] = useState<DiagnosisHistory[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 初始化演示数据
  useEffect(() => {
    setDiagnosisHistory([
      {
        id: '1',
        title: '节点资源使用率分析',
        date: new Date(Date.now() - 86400000),
        summary: '分析了集群中节点的CPU和内存使用率，发现 node-1 和 node-2 负载较高'
      },
      {
        id: '2',
        title: 'Pod 失败原因分析',
        date: new Date(Date.now() - 172800000),
        summary: '分析了 broken-pod-456ij 失败的原因，发现是容器镜像拉取失败导致的'
      },
      {
        id: '3',
        title: '工作负载优化建议',
        date: new Date(Date.now() - 259200000),
        summary: '为 web-app 和 api-server 提供了资源分配优化建议'
      }
    ]);

    setMessages([
      {
        id: 'welcome',
        text: '你好！我是 Kubernetes AI 助手，可以帮助你分析集群状态、诊断问题并提供优化建议。请告诉我你需要什么帮助？',
        sender: 'ai',
        timestamp: new Date()
      }
    ]);
  }, []);
  
  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 处理登出
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // 导航到其他页面
  const navigateTo = (path: string) => {
    navigate(path);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  // 渲染导航项
  const renderNavItem = (icon: React.ReactNode, label: string, path: string) => {
    const active = location.pathname === path;

    return (
    <motion.div 
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-300
        ${active 
          ? theme === 'dark' 
            ? 'bg-blue-900/30 text-blue-400' 
            : 'bg-blue-50 text-blue-600' 
          : theme === 'dark' 
            ? 'hover:bg-gray-800 text-gray-300' 
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      onClick={() => navigateTo(path)}
    >
      <span className="text-lg">{icon}</span>
      <span className="font-medium">{label}</span>
    </motion.div>
    );
  };

  // 发送消息
  const sendMessage = () => {
    if (!inputMessage.trim() || isSending) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage.trim(),
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputMessage('');
    setIsSending(true);
    
    // 模拟AI回复
    setTimeout(() => {
      setIsSending(false);
      
      const aiResponses: Record<string, string[]> = {
        '分析集群状态': [
          '让我为您分析一下集群状态...',
          '根据当前数据，您的Kubernetes集群总体状态良好，但有以下几点需要注意：\n\n1. 节点资源使用情况：\n   - node-1: CPU使用率65%，内存使用率78%（较高）\n   - node-2: CPU使用率45%，内存使用率62%\n   - node-3: 当前处于离线状态\n   - 其他节点资源使用正常\n\n2. Pods状态：\n   - 共有45个运行中的Pods\n   - 3个已暂停的Pods\n   - 2个失败的Pods（主要是broken-pod-456ij）\n\n3. 建议：\n   - 考虑为node-1增加资源或迁移部分负载\n   - 检查并修复node-3的离线问题\n   - 调查broken-pod-456ij失败的原因'
        ],
        '分析Pod失败原因': [
          '正在分析Pod失败原因...',
          '我分析了最近失败的Pods，主要问题如下：\n\n1. broken-pod-456ij：\n   - 失败原因：容器镜像拉取失败（ErrImagePull）\n   - 错误信息："failed to pull image \'faulty-app:v1.0.0\': rpc error: code = Unknown desc = repository does not exist or may require \'docker login\'" \n   - 建议：检查镜像名称是否正确，确保镜像仓库可访问\n\n2. web-app-789df：\n   - 最近有1次重启记录\n   - 重启原因：OOMKilled（内存不足）\n   - 建议：考虑增加容器的内存限制或优化应用内存使用'
        ],
        '提供工作负载优化建议': [
          '正在生成工作负载优化建议...',
          '基于您的集群数据，我为以下工作负载提供了优化建议：\n\n1. web-app Deployment：\n   - 当前配置：3个副本，每个副本请求100m CPU / 256Mi内存，限制200m CPU / 512Mi内存\n   - 建议：考虑将副本数增加到4个，以提高可用性；或者如果资源紧张，也可以降低副本的内存请求至200Mi\n\n2. api-server Deployment：\n   - 当前配置：2个副本，每个副本请求400m CPU / 1Gi内存\n   - 建议：考虑配置水平Pod自动伸缩（HPA），根据CPU使用率自动调整副本数\n\n3. database StatefulSet：\n   - 建议：配置Pod中断预算（PDB），确保至少有一个数据库Pod始终可用\n\n4. 整体资源分配优化：\n   - 考虑实施资源配额（Resource Quotas）和限制范围（Limit Ranges），以更好地管理命名空间级别的资源分配'
        ],
        '查看节点状态': [
          '正在查询节点状态...',
          '您的集群中有6个节点，详细状态如下：\n\n1. node-1 (192.168.1.101)\n   - 状态：在线\n   - CPU使用率：65%\n   - 内存使用率：78%\n   - 运行中Pods：12\n\n2. node-2 (192.168.1.102)\n   - 状态：在线\n   - CPU使用率：45%\n   - 内存使用率：62%\n   - 运行中Pods：10\n\n3. node-3 (192.168.1.103)\n   - 状态：离线\n   - 运行中Pods：8\n\n4. node-4 (192.168.1.104)\n   - 状态：在线\n   - CPU使用率：30%\n   - 内存使用率：45%\n   - 运行中Pods：7\n\n5. node-5 (192.168.1.105)\n   - 状态：在线\n   - CPU使用率：55%\n   - 内存使用率：68%\n   - 运行中Pods：9\n\n6. node-6 (192.168.1.106)\n   - 状态：在线\n   - CPU使用率：25%\n   - 内存使用率：35%\n   - 运行中Pods：6\n\n注意：node-3已经离线，请及时检查并修复此问题。'
        ],
        '帮助': [
          '我是Kubernetes AI助手，我可以帮助您：\n\n1. 分析集群整体状态和资源使用情况\n2. 诊断Pod失败原因和集群问题\n3. 提供工作负载优化和资源分配建议\n4. 解释Kubernetes概念和最佳实践\n5. 生成集群配置示例\n\n您可以尝试提问：\n- 分析集群状态\n- 分析Pod失败原因\n- 提供工作负载优化建议\n- 查看节点状态'
        ]
      };
      
      // 查找匹配的回复，如果没有匹配项则使用默认回复
      let aiResponseText = '感谢您的提问！我正在分析您的问题...';
      
      // 检查是否有匹配的预定义回复
      for (const [key, responses] of Object.entries(aiResponses)) {
        if (userMessage.text.includes(key)) {
          // 先添加"正在处理"的消息
          setMessages(prevMessages => [
            ...prevMessages,
            {
              id: `${Date.now()}-processing`,
              text: responses[0],
              sender: 'ai',
              timestamp: new Date(),
              isProcessing: true
            }
          ]);
          
          // 延迟一段时间后添加完整回复
          setTimeout(() => {
            setMessages(prevMessages => 
              prevMessages.filter(msg => msg.id !== `${Date.now()}-processing`)
            );
            
            const fullResponse: Message = {
              id: `${Date.now()}-full`,
              text: responses[1],
              sender: 'ai',
              timestamp: new Date()
            };
            
            setMessages(prevMessages => [...prevMessages.filter(msg => msg.id !== `${Date.now()}-processing`), fullResponse]);
            
            // 添加到历史记录
            setDiagnosisHistory(prevHistory => [
              {
                id: Date.now().toString(),
                title: userMessage.text,
                date: new Date(),
                summary: responses[1].substring(0, 100) + '...'
              },
              ...prevHistory
            ]);
            
          }, 2000);
          
          return;
        }
      }
      
      // 默认回复
      const defaultResponses = [
        '感谢您的提问！根据您提供的信息，我需要更具体的细节来为您提供准确的帮助。您可以尝试提供更多上下文或具体问题，比如：\n\n1. 您想分析集群中的特定资源或组件\n2. 您遇到了某个具体的错误或问题\n3. 您想了解某种Kubernetes功能或最佳实践\n\n您也可以尝试提问："帮助"来查看我能提供的所有服务',
        '我理解您的需求，但需要更多信息来为您提供准确的建议。请提供更多关于您的集群状态、遇到的问题或具体需求的详细信息。\n\n如果您不确定如何开始，您可以尝试提问："分析集群状态"来获取集群的整体健康状况分析。'
      ];
      
      // 随机选择一个默认回复
      const randomResponse = defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
      
      const defaultMessage: Message = {
        id: Date.now().toString(),
        text: randomResponse,
        sender: 'ai',
        timestamp: new Date()
      };
      
      setMessages(prevMessages => [...prevMessages, defaultMessage]);
    }, 1000);
  };

  // 处理键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 删除历史记录
  const deleteHistoryItem = (id: string) => {
    setDiagnosisHistory(prevHistory => prevHistory.filter(item => item.id !== id));
    toast('诊断历史已删除');
  };

  // 查看历史记录详情
  const viewHistoryItem = (item: DiagnosisHistory) => {
    setActiveTab('chat');
    // 在实际应用中，这里应该加载对应的完整对话历史
    setMessages([
      {
        id: 'history-query',
        text: item.title,
        sender: 'user',
        timestamp: new Date()
      },
      {
        id: 'history-response',
        text: `这是您查询"${item.title}"的分析结果。\n\n${item.summary.substring(0, 200)}...\n\n（完整对话历史已加载）`,
        sender: 'ai',
        timestamp: new Date()
      }
    ]);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.5,
        staggerChildren: 0.1
      }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.3 }
    }
  };

  const headerIntro = (
    <div className="flex min-w-0 items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
        theme === 'dark'
          ? 'bg-blue-900/40 border-blue-800/60'
          : 'bg-blue-50 border-blue-200'
      }`}>
        <Brain className="text-blue-400" size={24} />
      </div>
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold leading-tight">AI 诊断助手</h1>
        <p className={`mt-1 text-sm md:text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          智能分析 Kubernetes 集群问题，提供专业建议和优化方案
        </p>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${
      theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
    }`}>
      {/* 侧边栏 - 移动端 */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)}></div>
          <motion.div 
            className={`fixed top-0 left-0 h-full w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <Server className="text-blue-500" />
                <h2 className="text-xl font-bold">K8s Agent</h2>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-md hover:bg-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
              {renderNavItem(<Server size={20} />, '节点', '/nodes')}
              {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
              {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
              {renderNavItem(<Settings size={20} />, '设置', '/settings')}
              {renderNavItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
            </div>
          </motion.div>
        </div>
      )}

      {/* 侧边栏 - 桌面端 */}
       <div className={`hidden lg:flex lg:flex-col w-64 border-r h-screen fixed ${
         theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
       }`}>
         <div className={`p-4 border-b flex items-center space-x-2 ${
           theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
         }`}>
            <Server className="text-blue-500" />
            <h2 className="text-xl font-bold">K8s Agent</h2>
        </div>
        <div className="p-4 space-y-1 flex-1 overflow-y-auto">
          {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
          {renderNavItem(<Server size={20} />, '节点', '/nodes')}
          {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
          {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
          {renderNavItem(<Settings size={20} />, '设置', '/settings')}
          {renderNavItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
        </div>
        <div className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
                <User size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">管理员</div>
                <div className="text-xs opacity-70">admin@k8s-agent.com</div>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              aria-label="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

       {/* 主内容区 */}
      <div className="flex-1 lg:ml-64">
        {/* 顶部导航栏 */}
         <header className={`sticky top-0 z-40 border-b ${
           theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
         }`}>
            <div className="flex items-start justify-between gap-4 p-4 md:px-6 md:py-5">
              <div className="flex min-w-0 items-start gap-4">
                <button 
                  onClick={() => setSidebarOpen(true)}
                className={`lg:hidden mt-1 p-2 rounded-md ${
                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}
              >
                <Menu size={20} />
              </button>
                {headerIntro}
            </div>
            <div className="flex shrink-0 items-center space-x-3">
              <button 
                onClick={toggleTheme}
                className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationCenter />
            </div>
          </div>
        </header>

        {/* AI诊断内容 */}
        <main className="p-4 md:p-6">
           {loading ? (
             <div className={`p-5 rounded-xl border shadow-sm animate-pulse-slow h-[calc(100vh-120px)] flex flex-col ${
               theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
             }`}>
              <div className="flex justify-between items-center mb-4">
                <div className={`h-8 w-1/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                <div className="flex space-x-2">
                  <div className={`h-8 w-24 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  <div className={`h-8 w-24 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                </div>
              </div>
              <div className={`flex-1 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                {/* 加载中的消息骨架屏 */}
                {[1, 2, 3].map((item) => (
                  <div key={item} className="p-4 border-b border-gray-600">
                    <div className={`h-4 w-1/6 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'} mb-2`}></div>
                    <div className={`h-4 w-full rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'} mb-1`}></div>
                    <div className={`h-4 w-3/4 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className={`h-12 w-full rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
              </div>
            </div>
          ) : (
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              className="h-[calc(100vh-120px)] flex flex-col"
            >
               {/* 诊断界面 */}

              {/* 诊断界面 */}
               <motion.div 
                variants={itemVariants}
                className={`rounded-xl border shadow-sm flex flex-col h-full ${
                  theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                }`}
              >
                {/* 标签页 */}
                 <div className={`border-b flex ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <button 
                    className={`flex-1 py-3 px-4 text-sm font-medium ${
                       activeTab === 'chat' 
                        ? theme === 'dark'
                          ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                          : 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                        : theme === 'dark'
                          ? 'text-gray-400 hover:text-white'
                          : 'text-gray-500 hover:text-gray-900'
                    } transition-colors`}
                    onClick={() => setActiveTab('chat')}
                  >
                    <MessageCircle size={16} className="inline-block mr-1" />
                    聊天
                  </button>
                  <button 
                     className={`flex-1 py-3 px-4 text-sm font-medium ${
                       activeTab === 'history' 
                         ? theme === 'dark'
                           ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                           : 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
                         : theme === 'dark'
                           ? 'text-gray-400 hover:text-white'
                           : 'text-gray-500 hover:text-gray-900'
                     } transition-colors`}
                    onClick={() => setActiveTab('history')}
                  >
                    <History size={16} className="inline-block mr-1" />
                    诊断历史
                  </button>
                </div>

                {/* 聊天内容 */}
                {activeTab === 'chat' && (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                      {messages.map((message) => (
                        <div 
                          key={message.id} 
                          className={`flex ${
                            message.sender === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div className={`flex flex-col max-w-[80%] ${
                            message.sender === 'user' ? 'items-end' : 'items-start'
                          }`}>
                            <div className={`text-xs mb-1 ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {message.sender === 'user' ? '您' : 'AI助手'}
                              {' · '}
                              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div 
                               className={`p-3 rounded-lg ${
                                 message.sender === 'user' 
                                   ? 'bg-blue-600 text-white' 
                                   : theme === 'dark'
                                     ? 'bg-gray-700 text-white'
                                     : 'bg-gray-100 text-gray-900'
                               } ${message.isProcessing ? 'animate-pulse' : ''}`}
                            >
                              <pre className="whitespace-pre-wrap text-left font-sans">
                                {message.text}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                      {isSending && (
                        <div className="flex justify-start">
                          <div className="flex flex-col max-w-[80%] items-start">
                            <div className={`text-xs mb-1 ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              AI助手 · 正在输入...
                            </div>
                               <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}>
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* 输入区域 */}
                     <div className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className="relative">
                        <textarea
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder="请输入您的问题，例如：分析集群状态、分析Pod失败原因..."
                               className={`w-full pr-12 pl-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24 ${
                                 theme === 'dark'
                                   ? 'border-gray-600 bg-gray-700 text-white'
                                   : 'border-gray-300 bg-white text-gray-900'
                               }`}
                        />
                        <button
                          onClick={sendMessage}
                          disabled={!inputMessage.trim() || isSending}
                             className={`absolute right-3 bottom-3 p-2 rounded-full ${
                               (!inputMessage.trim() || isSending)
                                 ? 'bg-gray-600 cursor-not-allowed'
                                 : 'bg-blue-600 hover:bg-blue-700'
                             } text-white transition-colors`}
                          aria-label="发送消息"
                        >
                          <Send size={18} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button 
                           className={`px-3 py-1 text-xs rounded-full ${
                             theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                           }`}
                          onClick={() => setInputMessage('分析集群状态')}
                        >
                          分析集群状态
                        </button>
                        <button 
                           className={`px-3 py-1 text-xs rounded-full ${
                             theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                           }`}
                          onClick={() => setInputMessage('分析Pod失败原因')}
                        >
                          分析Pod失败原因
                        </button>
                        <button 
                           className={`px-3 py-1 text-xs rounded-full ${
                             theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                           }`}
                          onClick={() => setInputMessage('提供工作负载优化建议')}
                        >
                          提供工作负载优化建议
                        </button>
                        <button 
                           className={`px-3 py-1 text-xs rounded-full ${
                             theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                           }`}
                          onClick={() => setInputMessage('查看节点状态')}
                        >
                          查看节点状态
                        </button>
                        <button 
                           className={`px-3 py-1 text-xs rounded-full ${
                             theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                           }`}
                          onClick={() => setInputMessage('帮助')}
                        >
                          帮助
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 历史记录内容 */}
                {activeTab === 'history' && (
                  <div className="flex-1 overflow-y-auto p-4">
                    {diagnosisHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <History size={48} className={`mb-4 opacity-20 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>暂无诊断历史记录</p>
                        <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                          开始与AI助手对话，您的诊断历史将保存在这里
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {diagnosisHistory.map((item) => (
                          <motion.div 
                            key={item.id}
                             className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-all ${
                               theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
                             }`}
                            whileHover={{ y: -2 }}
                            onClick={() => viewHistoryItem(item)}
                          >
                            <div className="flex justify-between items-start">
                              <h3 className="font-medium">{item.title}</h3>
                              <button 
                                className={`p-1 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400 hover:text-red-300' : 'hover:bg-gray-100 text-red-500 hover:text-red-600'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteHistoryItem(item.id);
                                }}
                                aria-label="删除历史记录"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                              {item.summary}
                            </p>
                            <div className="flex items-center mt-3 text-xs text-gray-500 dark:text-gray-400">
                              <Clock size={12} className="mr-1" />
                              {item.date.toLocaleDateString()} {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

               {/* 诊断界面 */}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AIDiagnosis;
