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
 * Counts shown next to nav items (24 / 8 / 3 …) come from `mock/sidebarCounts`
 * for now — the backend doesn't expose aggregate counts per resource yet.
 * Replacing them with live values is one API call away (see design_update.md
 * Phase 4).
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
  Activity,
  Plus,
  Search,
  Settings,
  Eye,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
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
import { ApiKeyDialog } from './ApiKeyDialog';
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
}

function parseServerTime(s: string | null | undefined): number {
  if (!s) return 0;
  const hasTz = /Z$|[+\-]\d{2}:?\d{2}$/.test(s);
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

export function AppSidebar({ currentView, onNavigate, onSelectThread }: AppSidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

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
  }, [loadRecents]);

  const handleLogout = () => {
    logout();
    toast({ title: '已退出登录', description: '期待您的再次访问' });
    navigate('/login');
  };

  const handleSearch = () => {
    toast({
      title: '搜索即将开放',
      description: '后端尚未提供全文搜索接口，可临时使用「对话历史」页内搜索。',
    });
  };

  // Global keyboard shortcuts. ⌘N (Ctrl+N on Win/Linux) starts a fresh
  // chat thread, ⌘K opens the search affordance. Skip when the user is
  // actively typing into a form field so we don't steal real keystrokes.
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        if (isEditable(e.target)) return;
        e.preventDefault();
        onNavigate('chat');
      } else if (key === 'k') {
        // ⌘K can be intercepted from anywhere — that's the convention.
        e.preventDefault();
        handleSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // handleSearch is stable enough — it only closes over toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNavigate]);

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
    { id: 'chat', icon: MessageSquare, label: '对话', view: 'chat', badge: '⌘1' },
    { id: 'history', icon: History, label: '对话历史', view: 'history' },
    { id: 'tools', icon: Wrench, label: '工具', view: 'user-tools' },
    { id: 'skills', icon: Lightbulb, label: '技能', view: 'user-skills' },
    { id: 'files', icon: FolderOpen, label: '文件', view: 'user-files' },
    { id: 'api-keys', icon: Key, label: 'API Key', view: '__api-keys', onClick: () => setApiKeyOpen(true) },
  ];

  // Admin items — visible by role; L2 sees user management only.
  // 模型管理 is intentionally absent: it currently lives nested under
  // GlobalManagement and doesn't have its own route. Phase 2.3 promotes
  // it to a top-level view; we'll restore the entry then.
  const adminItems: Array<{
    id: string;
    icon: React.ElementType;
    label: string;
    view: string;
    superOnly?: boolean;
  }> = [
    { id: 'user-management', icon: Users, label: '用户管理', view: 'user-management' },
    { id: 'global-management', icon: ShieldCheck, label: '全局工具技能', view: 'global-management', superOnly: true },
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
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              v0.4.2
            </span>
          </div>
          <SidebarTrigger className="h-6 w-6 text-muted-foreground" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* ─── Quick actions: new chat + search ───────────── */}
        <SidebarGroup className="pt-2 pb-1">
          <SidebarGroupContent>
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="group/action flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-2.5 text-left text-[12.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="flex-1">新建对话</span>
              <kbd className="rounded border border-sidebar-border/70 bg-sidebar-accent/40 px-1.5 py-0 font-mono text-[9.5px] leading-tight text-muted-foreground">
                ⌘N
              </kbd>
            </button>
            <button
              type="button"
              onClick={handleSearch}
              className="mt-1 flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <Search className="h-3 w-3" />
              <span className="flex-1">搜索…</span>
              <kbd className="font-mono text-[9.5px] text-muted-foreground/70">⌘K</kbd>
            </button>
          </SidebarGroupContent>
        </SidebarGroup>

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
            <SidebarGroupAction
              title="查看全部"
              onClick={() => onNavigate('history')}
              className="text-[11px] text-muted-foreground"
            >
              全部
            </SidebarGroupAction>
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
                <DropdownMenuItem onClick={() => setApiKeyOpen(true)}>
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
      <ApiKeyDialog open={apiKeyOpen} onOpenChange={setApiKeyOpen} />
    </Sidebar>
  );
}
