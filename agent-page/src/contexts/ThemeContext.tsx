import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, themes } from '../lib/themes';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  mode: ThemeMode;
  setTheme: (theme: Theme) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 从 localStorage 读取保存的主题设置
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme as Theme) || 'slate';
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('theme-mode');
    if (savedMode === 'dark' || savedMode === 'light') {
      return savedMode;
    }
    // 检测系统主题
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  // 应用主题到 DOM
  useEffect(() => {
    const root = document.documentElement;
    const themeConfig = themes[theme];
    const cssVars = mode === 'dark' ? themeConfig.cssVars.dark : themeConfig.cssVars.light;

    // 移除旧的主题类
    root.classList.remove('light', 'dark');
    root.classList.add(mode);

    // 应用 CSS 变量
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // 调试日志
    console.log('Theme applied:', { theme, mode, hasClass: root.classList.contains('dark') });

    // 保存到 localStorage
    localStorage.setItem('theme', theme);
    localStorage.setItem('theme-mode', mode);
  }, [theme, mode]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
  };

  const toggleMode = () => {
    setModeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
