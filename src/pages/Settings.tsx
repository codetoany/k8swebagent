  import { useState, useEffect } from 'react';
  import { motion } from 'framer-motion';
  import { 
    Server, BarChart3, Database, Network, Settings, LogOut, 
    Moon, Sun, Menu, X, Search, Bell, ChevronDown, 
    RefreshCw, PlusCircle, MoreVertical, Filter, Download,
    AlertCircle, CheckCircle, ArrowUpDown, Eye, 
    User, Shield, BellRing, Info, HelpCircle,
    ExternalLink, Save, X as XIcon,
    BarChart, Brain, Edit, Trash, Check
  } from 'lucide-react';
  import { useThemeContext } from '@/contexts/themeContext';
  import { useTheme, Theme } from '@/hooks/useTheme';
  import { useContext } from 'react';
  import { AuthContext } from '@/contexts/authContext';
  import { useNavigate } from 'react-router-dom';
  import { toast } from 'sonner';

  // 定义设置选项类型
  type ThemeOption = 'light' | 'dark' | 'system';
  type NotificationOption = 'all' | 'critical' | 'none';
  type LanguageOption = 'zh-CN' | 'en-US';
  
  // 定义AI模型类型
  interface AIModel {
    id: string;
    name: string;
    apiBaseUrl: string;
    apiKey: string;
    modelType: string;
    isDefault: boolean;
  }

  const SettingsPage = () => {
    const { theme, toggleTheme, isDark } = useThemeContext();
    const { logout, isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading] = useState(false);
    const [activeTab, setActiveTab] = useState('general');
    
    // 设置表单状态
    const [themeOption, setThemeOption] = useState<ThemeOption>('system');
    const [notificationOption, setNotificationOption] = useState<NotificationOption>('all');
    const [languageOption, setLanguageOption] = useState<LanguageOption>('zh-CN');
    const [autoRefresh, setAutoRefresh] = useState<number>(30);
    const [showResourceUsage, setShowResourceUsage] = useState(true);
    const [showEvents, setShowEvents] = useState(true);
    
    // AI模型相关状态
    const [aiModels, setAiModels] = useState<AIModel[]>([]);
    const [isAddingModel, setIsAddingModel] = useState(false);
    const [editingModel, setEditingModel] = useState<AIModel | null>(null);
    const [newModel, setNewModel] = useState<AIModel>({
      id: '',
      name: '',
      apiBaseUrl: '',
      apiKey: '',
      modelType: 'openai',
      isDefault: false
    });
    
    // 模拟加载数据
    useEffect(() => {
      // 初始化设置值
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme) {
        if (savedTheme === 'system') {
          setThemeOption('system');
        } else {
          setThemeOption(savedTheme as ThemeOption);
        }
      }
      
      // 初始化AI模型数据
      const savedModels = localStorage.getItem('aiModels');
      if (savedModels) {
        setAiModels(JSON.parse(savedModels));
      } else {
        // 默认模型数据
        const defaultModels: AIModel[] = [
          {
            id: 'openai-gpt4o',
            name: 'OpenAI GPT-4o',
            apiBaseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            modelType: 'openai',
            isDefault: true
          },
          {
            id: 'anthropic-claude3',
            name: 'Anthropic Claude 3',
            apiBaseUrl: 'https://api.anthropic.com/v1',
            apiKey: '',
            modelType: 'anthropic',
            isDefault: false
          }
        ];
        setAiModels(defaultModels);
        localStorage.setItem('aiModels', JSON.stringify(defaultModels));
      }
      
    }, []);

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

    // 处理主题变更
    const handleThemeChange = (option: ThemeOption) => {
      setThemeOption(option);
      localStorage.setItem('theme', option);
      
      if (option === 'system') {
        const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(isDarkMode ? 'dark' : 'light');
      } else {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(option);
      }
    };

    // 保存设置
    const handleSaveSettings = () => {
      // 模拟保存设置到本地存储
      const settings = {
        themeOption,
        notificationOption,
        languageOption,
        autoRefresh,
        showResourceUsage,
        showEvents
      };
      
      localStorage.setItem('k8s-agent-settings', JSON.stringify(settings));
      
      // 显示保存成功提示
      toast('设置已保存！');
    };

    // 渲染导航项
    const renderNavItem = (icon: React.ReactNode, label: string, path: string, active: boolean = false) => (
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
    
    // 保存AI模型
    const saveAiModels = (models: AIModel[]) => {
      setAiModels(models);
      localStorage.setItem('aiModels', JSON.stringify(models));
    };
    
    // 添加AI模型
    const handleAddModel = () => {
      if (!newModel.name || !newModel.apiBaseUrl) {
        toast('请填写模型名称和API基础地址');
        return;
      }
      
      const updatedModels = [...aiModels];
      
      // 如果设置为默认，取消其他模型的默认状态
      if (newModel.isDefault) {
        updatedModels.forEach(model => model.isDefault = false);
      }
      
      const modelToAdd = {
        ...newModel,
        id: newModel.id || `model-${Date.now()}`,
      };
      
      updatedModels.push(modelToAdd);
      saveAiModels(updatedModels);
      
      // 重置表单
      setNewModel({
        id: '',
        name: '',
        apiBaseUrl: '',
        apiKey: '',
        modelType: 'openai',
        isDefault: false
      });
      setIsAddingModel(false);
      toast('AI模型已添加');
    };
    
    // 编辑AI模型
    const handleEditModel = (model: AIModel) => {
      setEditingModel({...model});
    };
    
    // 保存编辑的模型
    const handleSaveEdit = () => {
      if (!editingModel || !editingModel.name || !editingModel.apiBaseUrl) {
        toast('请填写模型名称和API基础地址');
        return;
      }
      
      const updatedModels = aiModels.map(model => {
        if (model.id === editingModel.id) {
          return editingModel;
        }
        // 如果编辑的模型设置为默认，取消其他模型的默认状态
        if (editingModel.isDefault) {
          return {...model, isDefault: false};
        }
        return model;
      });
      
      saveAiModels(updatedModels);
      setEditingModel(null);
      toast('AI模型已更新');
    };
    
    // 删除AI模型
    const handleDeleteModel = (id: string) => {
      if (aiModels.length <= 1) {
        toast('至少需要保留一个AI模型');
        return;
      }
      
      const updatedModels = aiModels.filter(model => model.id !== id);
      saveAiModels(updatedModels);
      toast('AI模型已删除');
    };
    
    // 设置默认模型
    const handleSetDefault = (id: string) => {
      const updatedModels = aiModels.map(model => ({
        ...model,
        isDefault: model.id === id
      }));
      saveAiModels(updatedModels);
      toast('默认模型已设置');
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

    return (
      <div className={`min-h-screen flex ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-300`}>
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
                 {renderNavItem(<Settings size={20} />, '设置', '/settings', true)}
              </div>
            </motion.div>
          </div>
        )}

        {/* 侧边栏 - 桌面端 */}
        <div className={`hidden lg:flex lg:flex-col w-64 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-r ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} h-screen fixed`}>
          <div className="p-4 border-b border-gray-700 flex items-center space-x-2">
            <Server className="text-blue-500" />
            <h2 className="text-xl font-bold">K8s Agent</h2>
          </div>
          <div className="p-4 space-y-1 flex-1 overflow-y-auto">
            {renderNavItem(<BarChart3 size={20} />, '仪表盘', '/dashboard')}
            {renderNavItem(<Server size={20} />, '节点', '/nodes')}
            {renderNavItem(<Database size={20} />, 'Pods', '/pods')}
            {renderNavItem(<Network size={20} />, '工作负载', '/workloads')}
            {renderNavItem(<Settings size={20} />, '设置', '/settings', true)}
            {renderNavItem(<AlertCircle size={20} />, 'AI 诊断', '/ai-diagnosis')}
          </div>
          <div className="p-4 border-t border-gray-700">
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
          <header className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md hover:bg-gray-700"
                >
                  <Menu size={20} />
                </button>
                <h1 className="text-xl font-bold">应用设置</h1>
              </div>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={toggleTheme}
                  className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                  aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                >
                  {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <button className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} relative`}>
                  <Bell size={20} />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
              </div>
            </div>
          </header>

          {/* 设置内容 */}
          <main className="p-4 md:p-6">
            {loading ? (
              <div className={`p-5 rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm animate-pulse-slow`}>
                <div className="flex flex-col space-y-4">
                  <div className={`h-8 w-1/4 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                  <div className="flex space-x-4">
                    {[1, 2, 3, 4, 5].map((item) => (
                      <div key={item} className={`h-10 w-24 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="space-y-2">
                          <div className={`h-4 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                          <div className={`h-12 w-full rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="space-y-2">
                          <div className={`h-4 w-1/3 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                          <div className={`h-12 w-full rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <motion.div 
                initial="hidden"
                animate="visible"
                variants={containerVariants}
              >
                {/* 页面标题 */}
                <motion.div 
                  variants={itemVariants}
                  className="mb-6"
                >
                  <h2 className="text-xl font-bold mb-1">设置</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    自定义 K8s Agent 的外观和行为
                  </p>
                </motion.div>

                {/* 设置选项卡 */}
                <motion.div 
                  variants={itemVariants}
                  className="mb-6 border-b border-gray-700"
                >
                  <div className="flex space-x-1 overflow-x-auto pb-2">
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'general' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('general')}
                    >
                      通用
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'notifications' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('notifications')}
                    >
                      通知
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'appearance' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('appearance')}
                    >
                      外观
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'advanced' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('advanced')}
                    >
                      高级
                    </button>
                    <button 
                      className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                        activeTab === 'ai-models' 
                          ? theme === 'dark' 
                            ? 'bg-gray-750 text-white border-b-2 border-blue-500' 
                            : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500' 
                          : theme === 'dark' 
                            ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveTab('ai-models')}
                    >
                      <Brain size={16} className="inline mr-1" />
                      AI 模型
                    </button>
                  </div>
                </motion.div>

                {/* 设置表单 */}
                <motion.div 
                  variants={itemVariants}
                  className={`rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} shadow-sm p-5`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 左侧设置 */}
                    <div className="space-y-6">
                      {activeTab === 'general' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              主题
                            </label>
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="theme-light"
                                  name="theme"
                                  value="light"
                                  checked={themeOption === 'light'}
                                  onChange={() => handleThemeChange('light')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="theme-light" className="ml-2 text-sm">
                                  亮色模式
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="theme-dark"
                                  name="theme"
                                  value="dark"
                                  checked={themeOption === 'dark'}
                                  onChange={() => handleThemeChange('dark')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="theme-dark" className="ml-2 text-sm">
                                  暗色模式
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="theme-system"
                                  name="theme"
                                  value="system"
                                  checked={themeOption === 'system'}
                                  onChange={() => handleThemeChange('system')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="theme-system" className="ml-2 text-sm">
                                  跟随系统
                                </label>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              语言
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              value={languageOption}
                              onChange={(e) => setLanguageOption(e.target.value as LanguageOption)}
                            >
                              <option value="zh-CN">简体中文</option>
                              <option value="en-US">English (US)</option>
                            </select>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              自动刷新间隔 (秒)
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              value={autoRefresh}
                              onChange={(e) => setAutoRefresh(parseInt(e.target.value))}
                            >
                              <option value={10}>10</option>
                              <option value={30}>30</option>
                              <option value={60}>60</option>
                              <option value={120}>120</option>
                              <option value={300}>300</option>
                              <option value={0}>禁用</option>
                            </select>
                          </div>
                        </>
                      )}

                      {activeTab === 'notifications' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              通知级别
                            </label>
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="notifications-all"
                                  name="notifications"
                                  value="all"
                                  checked={notificationOption === 'all'}
                                  onChange={() => setNotificationOption('all')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                /><label htmlFor="notifications-all" className="ml-2 text-sm">
                                  所有通知
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="notifications-critical"
                                  name="notifications"
                                  value="critical"
                                  checked={notificationOption === 'critical'}
                                  onChange={() => setNotificationOption('critical')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="notifications-critical" className="ml-2 text-sm">
                                  仅重要通知
                                </label>
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="radio"
                                  id="notifications-none"
                                  name="notifications"
                                  value="none"
                                  checked={notificationOption === 'none'}
                                  onChange={() => setNotificationOption('none')}
                                  className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                />
                                <label htmlFor="notifications-none" className="ml-2 text-sm">
                                  禁用通知
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              通知类型
                            </h3>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <BellRing size={16} className="mr-2" />
                                <span className="text-sm">节点状态变化</span>
                              </div><label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} className="sr-only peer" />
                                <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                              </label>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <AlertCircle size={16} className="mr-2" />
                                <span className="text-sm">Pod 失败通知</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={true} readOnly className="sr-only peer" />
                                <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                              </label>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <RefreshCw size={16} className="mr-2" />
                                <span className="text-sm">工作负载更新</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={true} readOnly className="sr-only peer" />
                                <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                              </label>
                            </div>
                          </div>
                        </>
                      )}

                      {activeTab === 'appearance' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              仪表盘显示选项
                            </label>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Server size={16} className="mr-2" />
                                  <span className="text-sm">显示资源使用图表</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={showResourceUsage} onChange={(e) => setShowResourceUsage(e.target.checked)} className="sr-only peer" />
                                  <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                </label>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Bell size={16} className="mr-2" />
                                  <span className="text-sm">显示最近事件</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} className="sr-only peer" />
                                  <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                </label>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <BarChart size={16} className="mr-2" />
                                  <span className="text-sm">显示命名空间分布</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={true} readOnly className="sr-only peer" />
                                  <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                </label>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              导航栏位置
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              defaultValue="left"
                            >
                              <option value="left">左侧</option>
                              <option value="top">顶部</option>
                            </select>
                          </div>
                        </>
                      )}

                      {activeTab === 'advanced' && (
                        <>
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              API 服务器地址
                            </label>
                            <input
                              type="text"
                              defaultValue="https://kubernetes.default.svc"
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              disabled
                            />
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              认证方式
                            </label>
                            <select
                              className={`block w-full pl-3 pr-10 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                              defaultValue="service-account"
                              disabled
                            >
                              <option value="service-account">服务账户</option>
                              <option value="token">令牌</option>
                              <option value="kubeconfig">KubeConfig</option>
                            </select>
                          </div>

                          <div>
                            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              调试模式
                            </label>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" defaultChecked={false} className="sr-only peer" disabled />
                              <div className={`w-9 h-5 rounded-full peer ${theme === 'dark' ? 'bg-gray-700 peer-checked:bg-blue-600' : 'bg-gray-200 peer-checked:bg-blue-500'} peer-focus:outline-none`}></div>
                              <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                            </label>
                            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                              仅管理员可启用
                            </p>
                          </div>
                        </>
                      )}

                      {/* AI模型配置 */}
                      {activeTab === 'ai-models' && (
                        <>
                          <div className="flex justify-between items-center mb-4">
                            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              AI 大模型配置
                            </h3>
                            <button 
                              onClick={() => setIsAddingModel(true)}
                              className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                            >
                              <PlusCircle size={14} className="mr-1" />
                              添加模型
                            </button>
                          </div>
                          
                          <div className="space-y-4">
                            {aiModels.map(model => (
                              <motion.div 
                                key={model.id}
                                className={`p-4 rounded-lg border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} transition-all duration-200 ${editingModel?.id === model.id ? (theme === 'dark' ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200') : ''}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                              >
                                {editingModel?.id === model.id ? (
                                  // 编辑模式
                                  <div className="space-y-3">
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        模型名称
                                      </label>
                                      <input
                                        type="text"
                                        value={editingModel.name}
                                        onChange={(e) => setEditingModel({...editingModel, name: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        API 基础地址
                                      </label>
                                      <input
                                        type="text"
                                        value={editingModel.apiBaseUrl}
                                        onChange={(e) => setEditingModel({...editingModel, apiBaseUrl: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        API 密钥
                                      </label>
                                      <input
                                        type="password"
                                        value={editingModel.apiKey}
                                        onChange={(e) => setEditingModel({...editingModel, apiKey: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      />
                                    </div>
                                    <div>
                                      <label className={`block text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        模型类型
                                      </label>
                                      <select
                                        value={editingModel.modelType}
                                        onChange={(e) => setEditingModel({...editingModel, modelType: e.target.value})}
                                        className={`w-full px-3 py-2 text-sm border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                                      >
                                        <option value="openai">OpenAI</option>
                                        <option value="anthropic">Anthropic</option>
                                        <option value="other">其他</option>
                                      </select>
                                    </div>
                                    <div className="flex items-center">
                                      <input
                                        type="checkbox"
                                        id={`default-${model.id}`}
                                        checked={editingModel.isDefault}
                                        onChange={(e) => setEditingModel({...editingModel, isDefault: e.target.checked})}
                                        className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                                      />
                                      <label htmlFor={`default-${model.id}`} className="ml-2 text-sm">
                                        设置为默认模型
                                      </label>
                                    </div>
                                    <div className="flex justify-end space-x-2 pt-2 border-t border-gray-700">
                                      <button 
                                        onClick={() => setEditingModel(null)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                                      >
                                        取消
                                      </button>
                                      <button 
                                        onClick={handleSaveEdit}
                                        className={`px-3 py-1.5 text-xs font-medium rounded ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                                      >
                                        保存
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // 查看模式
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h4 className="font-medium flex items-center">
                                          {model.name}
                                          {model.isDefault && (
                                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                              默认
                                            </span>
                                          )}
                                        </h4>
                                        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          API 地址: {model.apiBaseUrl}
                                        </p>
                                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                          类型: {model.modelType === 'openai' ? 'OpenAI' : model.modelType === 'anthropic' ? 'Anthropic' : '其他'}
                                        </p>
                                      </div>
                                      <div className="flex space-x-1">
                                        {!model.isDefault && (
                                          <button 
                                            onClick={() => handleSetDefault(model.id)}
                                            className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                            aria-label="设为默认"
                                          >
                                            <Check size={14} />
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => handleEditModel(model)}
                                          className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                          aria-label="编辑"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        {aiModels.length > 1 && (
                                          <button 
                                            onClick={() => handleDeleteModel(model.id)}
                                            className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-200 text-red-500'}`}
                                            aria-label="删除"
                                          >
                                            <Trash size={14} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 右侧信息面板 */}
                    <div className={`space-y-6 ${theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50'} p-4 rounded-xl`}>
                      {activeTab !== 'ai-models' && (
                        <>
                          <div>
                            <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              <Info size={16} className="mr-1" />
                              关于 K8s Agent
                            </h3>
                            <div className="space-y-3 text-sm">
                              <div>
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>版本</p>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>v1.0.0</p>
                              </div>
                              <div>
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>构建时间</p>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>2026-03-13</p>
                              </div>
                              <div>
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Kubernetes 支持</p>
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>v1.24+</p>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                              <HelpCircle size={16} className="mr-1" />
                              获取帮助
                            </h3>
                            <div className="space-y-2">
                              <a 
                                href="#" 
                                className={`block py-2 px-3 rounded-lg text-sm flex items-center justify-between ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white text-gray-700'}`}
                                onClick={(e) => e.preventDefault()}
                              >
                                <span>文档中心</span>
                                <ExternalLink size={14} />
                              </a>
                              <a 
                                href="#" 
                                className={`block py-2 px-3 rounded-lg text-sm flex items-center justify-between ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white text-gray-700'}`}
                                onClick={(e) => e.preventDefault()}
                              >
                                <span>常见问题</span>
                                <ExternalLink size={14} />
                              </a>
                              <a 
                                href="#" 
                                className={`block py-2 px-3 rounded-lg text-sm flex items-center justify-between ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-white text-gray-700'}`}
                                onClick={(e) => e.preventDefault()}
                              >
                                <span>联系支持</span>
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        </>
                      )}
                      
                      {activeTab === 'ai-models' && (
                        <div>
                          <h3 className={`text-sm font-medium mb-3 flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            <Info size={16} className="mr-1" />
                            AI 模型配置说明
                          </h3>
                          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-blue-50'} text-sm space-y-2`}>
                            <p>您可以配置多个AI模型用于Kubernetes集群分析。默认模型将用于AI诊断功能。</p>
                            <p>对于OpenAI模型，API基础地址通常为：<code className="px-1 py-0.5 rounded bg-gray-700 text-green-400 text-xs">https://api.openai.com/v1</code></p>
                            <p>对于Anthropic模型，API基础地址通常为：<code className="px-1 py-0.5 rounded bg-gray-700 text-green-400 text-xs">https://api.anthropic.com/v1</code></p>
                            <p>API密钥将安全存储在本地浏览器中，不会被发送到任何服务器。</p>
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t border-gray-700">
                        {activeTab !== 'ai-models' ? (
                          <>
                            <button 
                              onClick={handleSaveSettings}
                              className={`w-full py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium ${
                                theme === 'dark' 
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                  : 'bg-blue-500 hover:bg-blue-600 text-white'
                              }`}
                            >
                              <Save size={16} />
                              <span>保存设置</span>
                            </button>
                            <button 
                              className={`w-full mt-3 py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium ${
                                theme === 'dark' 
                                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                              }`}
                            >
                              <XIcon size={16} />
                              <span>取消</span>
                            </button>
                          </>
                        ) : (
                          <div className="text-center text-sm opacity-70">
                            <p>配置会自动保存</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
                
                {/* 添加新模型的弹窗 */}
                {isAddingModel && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  >
                    <div 
                      className="absolute inset-0 bg-black bg-opacity-50"
                      onClick={() => {
                        setIsAddingModel(false);
                        setNewModel({
                          id: '',
                          name: '',
                          apiBaseUrl: '',
                          apiKey: '',
                          modelType: 'openai',
                          isDefault: false
                        });
                      }}
                    ></div>
                    <motion.div 
                      initial={{ y: -50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -50, opacity: 0 }}
                      className={`w-full max-w-md rounded-xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} shadow-lg p-5 relative z-10`}
                    >
                      <h3 className="text-lg font-bold mb-4">添加 AI 模型</h3>
                      <div className="space-y-4">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            模型名称
                          </label>
                          <input
                            type="text"
                            value={newModel.name}
                            onChange={(e) => setNewModel({...newModel, name: e.target.value})}
                            placeholder="例如：OpenAI GPT-4o"
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            API 基础地址
                          </label>
                          <input
                            type="text"
                            value={newModel.apiBaseUrl}
                            onChange={(e) => setNewModel({...newModel, apiBaseUrl: e.target.value})}
                            placeholder="例如：https://api.openai.com/v1"
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            API 密钥
                          </label>
                          <input
                            type="password"
                            value={newModel.apiKey}
                            onChange={(e) => setNewModel({...newModel, apiKey: e.target.value})}
                            placeholder="sk-..."
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            模型类型
                          </label>
                          <select
                            value={newModel.modelType}
                            onChange={(e) => setNewModel({...newModel, modelType: e.target.value})}
                            className={`w-full px-3 py-2 text-base border ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg`}
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="other">其他</option>
                          </select>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="new-model-default"
                            checked={newModel.isDefault}
                            onChange={(e) => setNewModel({...newModel, isDefault: e.target.checked})}
                            className={`w-4 h-4 text-blue-500 focus:ring-blue-400 border-gray-300 rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                          />
                          <label htmlFor="new-model-default" className="ml-2 text-sm">
                            设置为默认模型
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end space-x-3 mt-6">
                        <button 
                          onClick={() => {
                            setIsAddingModel(false);
                            setNewModel({
                              id: '',
                              name: '',
                              apiBaseUrl: '',
                              apiKey: '',
                              modelType: 'openai',
                              isDefault: false
                            });
                          }}
                          className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} text-sm font-medium`}
                        >
                          取消
                        </button>
                        <button 
                          onClick={handleAddModel}
                          className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white text-sm font-medium`}
                        >
                          添加
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </main>
        </div>
      </div>
    );
  };

  export default SettingsPage;
