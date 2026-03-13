import React, { createContext, useContext } from 'react';
import { useTheme as useThemeHook, Theme } from '@/hooks/useTheme';

// 定义主题上下文类型
type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
};

// 创建主题上下文
export const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: false
});

// 主题提供者组件
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme, setTheme, isDark } = useThemeHook();
  
  return React.createElement(ThemeContext.Provider, { value: { theme, toggleTheme, setTheme, isDark } }, children);
}

// 自定义 Hook 用于使用主题上下文
export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
