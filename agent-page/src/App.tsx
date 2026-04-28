import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, useSearchParams } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import { ToolsManager } from './components/ToolsManager';
import { SkillsManager } from './components/SkillsManager';
import { UserFilesManager } from './components/UserFilesManager';
import { UserManagement } from './components/UserManagement';
import { GlobalManagement } from './components/GlobalManagement';
import { ObservabilityPanel } from './components/ObservabilityPanel';
import { Layout } from './components/Layout';
import { ConversationHistoryPage } from './pages/ConversationHistoryPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/toaster';
import { chatApi, UserInfo } from './api/client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { PageHeaderProvider } from './contexts/PageHeaderContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ApiDocs from './pages/ApiDocs';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

type View = 'chat' | 'history' | 'user-tools' | 'user-skills' | 'user-files' | 'api-keys' | 'user-management' | 'global-management' | 'observability';
const ALL_VIEWS: View[] = ['chat', 'history', 'user-tools', 'user-skills', 'user-files', 'api-keys', 'user-management', 'global-management', 'observability'];

function MainApp() {
  // View lives in the URL (?view=...) so the browser back/forward
  // buttons navigate between views rather than dropping the user
  // back to /login. setSearchParams pushes a new history entry per
  // navigation, which is what we want.
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useMemo<View>(() => {
    const v = searchParams.get('view');
    return (ALL_VIEWS as string[]).includes(v || '') ? (v as View) : 'chat';
  }, [searchParams]);
  const pendingThreadId = searchParams.get('thread');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const setView = (next: View, opts?: { thread?: string | null }) => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set('view', next);
      if (opts && 'thread' in opts) {
        if (opts.thread) sp.set('thread', opts.thread);
        else sp.delete('thread');
      }
      return sp;
    });
  };

  const userInfo: UserInfo = {
    user_id: user?.id || 1,
    name: user?.name || '用户',
    role_level: user?.role_level || 1,
  };

  useEffect(() => {
    const checkConnection = async () => {
      try {
        await chatApi.checkHealth();
        setError(null);
      } catch (err: any) {
        setError('无法连接到服务器，请确保后端服务已启动');
      } finally {
        setIsLoading(false);
      }
    };
    checkConnection();
  }, []);

  const handleNavigate = (targetView: string) => {
    // Switching to a different view drops any previously-pinned
    // thread query so the chat page doesn't keep reloading the same
    // thread when the user comes back via sidebar navigation.
    setView(targetView as View, targetView === 'chat' ? undefined : { thread: null });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
        <p className="text-muted-foreground">正在连接...</p>
      </div>
    );
  }

  if (error && view === 'chat') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold mb-2">连接失败</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>重试</Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <Layout
        currentView={view}
        onNavigate={handleNavigate}
        onSelectThread={(threadId) => setView('chat', { thread: threadId })}
      >
        {view === 'chat' && (
          <ChatInterface userInfo={userInfo} initialThreadId={pendingThreadId || undefined} />
        )}
        {view === 'history' && (
          <ConversationHistoryPage
            onSelectConversation={(threadId) => setView('chat', { thread: threadId })}
            onNewConversation={() => setView('chat', { thread: null })}
          />
        )}
        {view === 'user-tools' && <ToolsManager />}
        {view === 'user-skills' && <SkillsManager />}
        {view === 'user-files' && <UserFilesManager />}
        {view === 'api-keys' && (
          <ApiKeysPage onNavigateHome={() => setView('chat', { thread: null })} />
        )}
        {view === 'user-management' && <UserManagement />}
        {view === 'global-management' && <GlobalManagement />}
        {view === 'observability' && <ObservabilityPanel />}
      </Layout>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PageHeaderProvider>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/api-docs" element={<ProtectedRoute><ApiDocs /></ProtectedRoute>} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <MainApp />
                  </ProtectedRoute>
                }
              />
            </Routes>
            <Toaster />
          </Router>
        </AuthProvider>
        </PageHeaderProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
