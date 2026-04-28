/**
 * 应用主布局 - 使用 shadcn/ui Sidebar Provider
 * https://ui.shadcn.com/docs/components/sidebar
 */
import React from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar';
import { Separator } from './ui/separator';
import { AppSidebar } from './AppSidebar';
import { ThemeSwitcher } from './ThemeSwitcher';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onNavigate,
}) => {
  return (
    <SidebarProvider className="!min-h-0 h-full">
      <AppSidebar currentView={currentView} onNavigate={onNavigate} />
      <SidebarInset className="min-h-0">
        {/* 48px topbar — matches v3 design system (was 64px). The
            page-level breadcrumb / actions are rendered by each page
            via <PageHeader/> from components/design when applicable;
            this app-level topbar stays minimal. */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <h1 className="text-sm font-medium text-foreground tracking-tight truncate">
              {currentView === 'chat' && '对话助手'}
              {currentView === 'user-tools' && '我的工具'}
              {currentView === 'user-skills' && '我的技能'}
              {currentView === 'user-files' && '文件管理'}
              {currentView === 'user-management' && '用户管理'}
              {currentView === 'global-management' && '全局管理'}
              {currentView === 'observability' && '观测面板'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
