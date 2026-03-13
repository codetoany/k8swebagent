import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useContext, useEffect } from 'react';
import { AuthContext } from '@/contexts/authContext';

export default function Home() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useContext(AuthContext);
  
  useEffect(() => {
    if (isAuthenticated) {
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    }
  }, [isAuthenticated, navigate]);
  
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.8,
        staggerChildren: 0.2
      }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.5 }
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-300`}>
      <motion.div 
        className="text-center p-8 rounded-2xl shadow-lg max-w-md w-full mx-4"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        style={{
          background: theme === 'dark' ? 'linear-gradient(145deg, #1e293b, #0f172a)' : 'linear-gradient(145deg, #ffffff, #f1f5f9)',
          boxShadow: theme === 'dark' 
            ? '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)' 
            : '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)'
        }}
      >
        <motion.div variants={itemVariants} className="mb-6">
          <div className="flex justify-center mb-4">
            <div className={`p-3 rounded-full ${theme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'}`}>
              <i className="fa-solid fa-server text-4xl text-blue-500"></i>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">K8s Agent</h1>
          <p className="text-lg opacity-80">
            Kubernetes 智能管理平台
          </p>
        </motion.div>
        
        <motion.div variants={itemVariants} className="mb-8">
          <div className="flex items-center justify-center space-x-2 opacity-70 text-sm">
            <span>连接您的 Kubernetes 集群</span>
          </div>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <button 
            onClick={() => navigate('/dashboard')}
            className={`px-6 py-3 rounded-full text-white font-medium transition-all duration-300 transform hover:scale-105 ${
              theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            进入控制台
          </button>
        </motion.div>
        
        <motion.button
          variants={itemVariants}
          onClick={toggleTheme}
          className={`mt-8 p-2 rounded-full ${
            theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'
          }`}
          aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
        >
          <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
        </motion.button>
      </motion.div>
      
      <motion.footer
        variants={itemVariants}
        className="mt-8 text-sm opacity-60"
      >
        <p>© 2026 K8s Agent. 版本 v1.0.0</p>
      </motion.footer>
    </div>
  );
}