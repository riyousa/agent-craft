/**
 * 应用主布局 - 使用 shadcn/ui Sidebar Provider
 * https://ui.shadcn.com/docs/components/sidebar
 */
import React from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar';
import { Separator } from './ui/separator';
import { AppSidebar } from './AppSidebar';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useAppHeaderState } from '../contexts/PageHeaderContext';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
  /** Forwarded to the sidebar's "最近对话" rows so clicking one loads
   *  that thread directly into chat instead of routing via /history. */
  onSelectThread?: (threadId: string) => void;
  /** Bumped from the chat page after a turn completes so the sidebar
   *  re-fetches its 最近对话 list without a hard refresh. */
  recentsRefreshKey?: number;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onNavigate,
  onSelectThread,
  recentsRefreshKey,
}) => {
  // Pages that render their own <PageHeader/> (v3 design migration)
  // suppress this default header so we don't end up with two stacked
  // top bars. Pages still on the legacy chrome see this as before.
  const { hidden: appHeaderHidden } = useAppHeaderState();
  return (
    <SidebarProvider className="!min-h-0 h-full">
      <AppSidebar
        currentView={currentView}
        onNavigate={onNavigate}
        onSelectThread={onSelectThread}
        recentsRefreshKey={recentsRefreshKey}
      />
      <SidebarInset className="min-h-0">
        {!appHeaderHidden && (
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <h1 className="text-sm font-medium text-foreground tracking-tight truncate">
              {currentView === 'chat' && '对话助手'}
              {currentView === 'history' && '对话历史'}
              {currentView === 'user-tools' && '我的工具'}
              {currentView === 'user-skills' && '我的技能'}
              {currentView === 'user-files' && '文件管理'}
              {currentView === 'api-keys' && 'API Key'}
              {currentView === 'user-management' && '用户管理'}
              {currentView === 'admin-tools' && '全局工具'}
              {currentView === 'admin-skills' && '全局技能'}
              {currentView === 'admin-models' && '模型管理'}
              {currentView === 'observability' && '观测面板'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
          </div>
        </header>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
