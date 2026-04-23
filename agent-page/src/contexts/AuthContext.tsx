import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, getCurrentUser } from '../api/auth';
import { useToast } from '../hooks/use-toast';

interface User {
  id: number;
  name: string;
  phone: string;
  email?: string;
  role_level: number;
  is_active: boolean;
  tags?: string[];
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, password: string, name: string, email?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // 监听认证错误事件
  useEffect(() => {
    const handleAuthError = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; code?: string }>;
      const { message, code } = customEvent.detail;

      toast({
        title: '认证失败',
        description: message,
        variant: 'destructive',
      });
    };

    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, [toast]);

  // 初始化时检查token并获取用户信息
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const userData = await getCurrentUser(storedToken);
          setUser(userData);
          setToken(storedToken);
        } catch (error) {
          console.error('Failed to get user info:', error);
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (phone: string, password: string) => {
    const response = await apiLogin(phone, password);
    setUser(response.user);
    setToken(response.access_token);
    localStorage.setItem('token', response.access_token);
  };

  const register = async (phone: string, password: string, name: string, email?: string) => {
    const response = await apiRegister(phone, password, name, email);
    setUser(response.user);
    setToken(response.access_token);
    localStorage.setItem('token', response.access_token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  const refreshUser = async () => {
    if (token) {
      try {
        const userData = await getCurrentUser(token);
        setUser(userData);
      } catch (error) {
        console.error('Failed to refresh user:', error);
        logout();
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
