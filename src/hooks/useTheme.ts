import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      return savedTheme;
    }
    return 'system';
  });
  
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // 设置初始暗色模式状态
    const updateDarkMode = () => {
      const isDark = theme === 'system' 
        ? window.matchMedia('(prefers-color-scheme: dark)').matches 
        : theme === 'dark';
      setIsDarkMode(isDark);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(isDark ? 'dark' : 'light');
    };
    
    // 初始化
    updateDarkMode();
    
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        updateDarkMode();
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    localStorage.setItem('theme', theme);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isCurrentlyDark = prevTheme === 'system' ? prefersDark : prevTheme === 'dark';
      return isCurrentlyDark ? 'light' : 'dark';
    });
  }, []);

  const applyTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
  }, []);

  return {
    theme,
    toggleTheme,
    setTheme: applyTheme,
    isDark: isDarkMode
  };
}
