/**
 * 应用侧边栏 - 使用 shadcn/ui Sidebar 组件
 * https://ui.shadcn.com/docs/components/sidebar
 */
import {
  MessageSquare,
  History,
  Wrench,
  Lightbulb,
  FolderOpen,
  Shield,
  ShieldCheck,
  Bot,
  LogOut,
  User,
  Users,
  Settings,
  ChevronsUpDown,
  Key,
  Activity,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { ProfileDialog } from './ProfileDialog';
import { ApiKeyDialog } from './ApiKeyDialog';
import React from 'react';

interface AppSidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export function AppSidebar({ currentView, onNavigate }: AppSidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [apiKeyOpen, setApiKeyOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    toast({
      title: '已退出登录',
      description: '期待您的再次访问',
    });
    navigate('/login');
  };

  const getUserInitial = () => {
    return user?.name?.charAt(0) || 'U';
  };

  const getRoleText = () => {
    if (!user) return '用户';
    switch (user.role_level) {
      case 3:
        return '超级管理员';
      case 2:
        return '管理员';
      case 1:
        return '普通用户';
      default:
        return '用户';
    }
  };

  const isAdmin = (user?.role_level || 0) >= 2;
  const isSuperAdmin = (user?.role_level || 0) >= 3;

  const menuItems = [
    {
      id: 'chat',
      icon: MessageSquare,
      label: '对话助手',
      view: 'chat',
    },
    {
      id: 'history',
      icon: History,
      label: '对话历史',
      view: 'history',
    },
    {
      id: 'tools',
      icon: Wrench,
      label: '我的工具',
      view: 'user-tools',
    },
    {
      id: 'skills',
      icon: Lightbulb,
      label: '我的技能',
      view: 'user-skills',
    },
    {
      id: 'files',
      icon: FolderOpen,
      label: '文件管理',
      view: 'user-files',
    },
    ...(isAdmin ? [
      {
        id: 'user-management',
        icon: Users,
        label: '用户管理',
        view: 'user-management',
      },
    ] : []),
    ...(isSuperAdmin ? [
      {
        id: 'global-management',
        icon: ShieldCheck,
        label: '全局管理',
        view: 'global-management',
      },
    ] : []),
    {
      id: 'observability',
      icon: Activity,
      label: '观测面板',
      view: 'observability',
    },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Bot className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">智能助手平台</span>
                <span className="truncate text-xs">Agent Craft</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.view;

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => onNavigate(item.view)}
                      tooltip={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                    <span className="font-semibold">{getUserInitial()}</span>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.name || '用户'}</span>
                    <span className="truncate text-xs">{getRoleText()}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                      <span className="font-semibold">{getUserInitial()}</span>
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user?.name || '用户'}</span>
                      <span className="truncate text-xs">{getRoleText()}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <User className="mr-2 size-4" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setApiKeyOpen(true)}>
                  <Key className="mr-2 size-4" />
                  API Key
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 size-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <ApiKeyDialog open={apiKeyOpen} onOpenChange={setApiKeyOpen} />
    </Sidebar>
  );
}
