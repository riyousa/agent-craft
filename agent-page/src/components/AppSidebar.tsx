/**
 * Application Sidebar — v3 design.
 *
 * Layout (top → bottom):
 *   1. Brand row    — logo + "Agent Craft" + version + collapse trigger
 *   2. Quick row    — 「新建对话」 + 「搜索…」 pills
 *   3. 工作区        — chat / history / tools / skills / files / api keys
 *   4. 管理          — admin-only group with SUPER ADMIN tag
 *   5. 最近对话      — top 5 from chatApi.listConversations
 *   6. User card     — avatar + name + role chip + dropdown
 *
 * Reference: design bundle (PSKRgbxCcC9dV9GvkEezKw),
 * agent-craft/project/app.jsx:145-372 Sidebar.
 *
 * Nav items currently render without count badges. If we later add per-
 * resource counts (24 / 8 / 3 …) the field is `badge?: string` on each
 * workspaceItem — populate from a real `userApi.counts()` call rather
 * than reintroducing a mock layer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  History,
  Wrench,
  Lightbulb,
  FolderOpen,
  Bot,
  LogOut,
  User,
  Users,
  Key,
  Settings,
  Eye,
  Cpu,
  Loader2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
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
import { Pill } from './design';
import { cn } from '../lib/utils';
import { chatApi, ConversationListItem } from '../api/client';

interface AppSidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  /** When set, clicking a recent-conversation row passes this thread id
   *  to the chat page. Optional so callers without history support pass
   *  `undefined` and the rows just route to the history page. */
  onSelectThread?: (threadId: string) => void;
  /** Re-fetch 最近对话 whenever this number changes — bumped by the
   *  chat page after a turn finishes so the latest thread surfaces
   *  without a hard refresh. */
  recentsRefreshKey?: number;
}

function parseServerTime(s: string | null | undefined): number {
  if (!s) return 0;
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  const t = new Date(hasTz ? s : s + 'Z').getTime();
  return isNaN(t) ? 0 : t;
}

function relTime(s: string | null | undefined): string {
  const ts = parseServerTime(s);
  if (!ts) return '——';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '现在';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 2) return '昨天';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}天`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function AppSidebar({ currentView, onNavigate, onSelectThread, recentsRefreshKey }: AppSidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profileOpen, setProfileOpen] = useState(false);

  // Recent conversations — paginated like the old drawer flow:
  // initial 15, "加载更多" appends another 15 until the API says
  // there's nothing left.
  const RECENTS_PAGE_SIZE = 15;
  const [recents, setRecents] = useState<ConversationListItem[]>([]);
  const [recentsPage, setRecentsPage] = useState(1);
  const [recentsHasMore, setRecentsHasMore] = useState(false);
  const [recentsLoadingMore, setRecentsLoadingMore] = useState(false);

  const loadRecents = useCallback(async (page: number, append: boolean) => {
    if (page > 1) setRecentsLoadingMore(true);
    try {
      const res = await chatApi.listConversations(page, RECENTS_PAGE_SIZE);
      setRecents((prev) => (append ? [...prev, ...(res.items || [])] : (res.items || [])));
      setRecentsHasMore(!!res.has_more);
      setRecentsPage(page);
    } catch {
      // Non-fatal — leave the section blank if it errors.
    } finally {
      setRecentsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadRecents(1, false);
  }, [loadRecents, recentsRefreshKey]);

  const handleLogout = () => {
    logout();
    toast({ title: '已退出登录', description: '期待您的再次访问' });
    navigate('/login');
  };

  const initial = (user?.name?.charAt(0) || 'U').toUpperCase();
  const isAdmin = (user?.role_level || 0) >= 2;
  const isSuperAdmin = (user?.role_level || 0) >= 3;

  // Workspace items — visible to every user.
  const workspaceItems: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    view: string;
    badge?: string;
    onClick?: () => void;
  }> = [
    { id: 'chat', icon: MessageSquare, label: '对话', view: 'chat' },
    { id: 'history', icon: History, label: '对话历史', view: 'history' },
    { id: 'tools', icon: Wrench, label: '工具', view: 'user-tools' },
    { id: 'skills', icon: Lightbulb, label: '技能', view: 'user-skills' },
    { id: 'files', icon: FolderOpen, label: '文件', view: 'user-files' },
    { id: 'api-keys', icon: Key, label: 'API Key', view: 'api-keys' },
  ];

  // Admin items — visible by role; L2 sees user management only.
  // Phase 2.2 / 2.3 split the legacy GlobalManagement page into three
  // dedicated entries (全局工具 / 全局技能 / 模型管理); the assignment
  // workflow stays under "下发管理".
  const adminItems: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    view: string;
    superOnly?: boolean;
  }> = [
    { id: 'user-management', icon: Users, label: '用户管理', view: 'user-management' },
    { id: 'admin-tools', icon: Wrench, label: '全局工具', view: 'admin-tools', superOnly: true },
    { id: 'admin-skills', icon: Lightbulb, label: '全局技能', view: 'admin-skills', superOnly: true },
    { id: 'admin-models', icon: Cpu, label: '模型管理', view: 'admin-models', superOnly: true },
    { id: 'observability', icon: Eye, label: '可观测', view: 'observability', superOnly: true },
  ].filter((it) => (it.superOnly ? isSuperAdmin : isAdmin));

  return (
    <Sidebar>
      {/* ─── Brand row ───────────────────────────────────── */}
      <SidebarHeader className="border-b border-sidebar-border/60 p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex aspect-square h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground">
              Agent Craft
            </span>
          </div>
          <SidebarTrigger className="h-6 w-6 text-muted-foreground" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* ─── Workspace ──────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>工作区</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((it) => {
                const Icon = it.icon;
                const active = currentView === it.view;
                return (
                  <SidebarMenuItem key={it.id}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={it.label}
                      onClick={it.onClick ?? (() => onNavigate(it.view))}
                      className={cn(
                        'relative h-8 text-[12.5px]',
                        active && 'font-medium',
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -left-1.5 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-sidebar-primary"
                        />
                      )}
                      <Icon className="h-3.5 w-3.5" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.badge && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {it.badge}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ─── Admin (admin / super admin) ────────────────── */}
        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <span>管理</span>
              {isSuperAdmin && <Pill tone="outline">SUPER ADMIN</Pill>}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((it) => {
                  const Icon = it.icon;
                  const active = currentView === it.view;
                  return (
                    <SidebarMenuItem key={it.id}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={it.label}
                        onClick={() => onNavigate(it.view)}
                        className={cn(
                          'relative h-8 text-[12.5px]',
                          active && 'font-medium',
                        )}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute -left-1.5 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-sidebar-primary"
                          />
                        )}
                        <Icon className="h-3.5 w-3.5" />
                        <span className="flex-1 truncate">{it.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ─── Recent conversations ───────────────────────── */}
        {recents.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>最近对话</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recents.map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton
                      tooltip={c.title || '未命名对话'}
                      onClick={() => {
                        if (onSelectThread) {
                          onSelectThread(c.thread_id);
                        } else {
                          onNavigate('history');
                        }
                      }}
                      className="h-7 text-[12px]"
                    >
                      {/* Title is the flex child that flexes; time chip
                          stays shrink-0 on the right so even very long
                          conversation names truncate cleanly without
                          sliding under the timestamp. */}
                      <span className="flex-1 truncate">
                        {c.title || '未命名对话'}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {relTime(c.updated_at || c.created_at)}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {recentsHasMore && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => loadRecents(recentsPage + 1, true)}
                      disabled={recentsLoadingMore}
                      className="h-7 justify-center text-[11.5px] text-muted-foreground hover:text-foreground"
                    >
                      {recentsLoadingMore ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>加载中…</span>
                        </>
                      ) : (
                        <span>加载更多</span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ─── User card ─────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-12 data-[state=open]:bg-sidebar-accent"
                >
                  <div
                    aria-hidden
                    className="flex aspect-square h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-sidebar-primary-foreground"
                    style={{
                      background:
                        'linear-gradient(135deg, hsl(var(--sidebar-foreground)) 0%, hsl(var(--muted-foreground)) 100%)',
                    }}
                  >
                    {initial}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-sidebar-foreground">
                        {user?.name || '用户'}
                      </span>
                      {user?.role_level === 3 ? (
                        <Pill tone="outline">L3</Pill>
                      ) : user?.role_level === 2 ? (
                        <Pill tone="outline">L2</Pill>
                      ) : (
                        <Pill tone="outline">L1</Pill>
                      )}
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {user?.role_level === 3
                        ? '超级管理员'
                        : user?.role_level === 2
                          ? '管理员'
                          : '普通用户'}
                    </span>
                  </div>
                  <Settings className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={8}
              >
                <DropdownMenuLabel className="p-2 font-normal">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {user?.email || user?.name}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <User className="mr-2 h-3.5 w-3.5" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate('api-keys')}>
                  <Key className="mr-2 h-3.5 w-3.5" />
                  API Key
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </Sidebar>
  );
}
