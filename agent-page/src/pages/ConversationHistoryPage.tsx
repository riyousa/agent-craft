/**
 * Conversation History — full-page list view.
 *
 * Replaces the modal/drawer-only ConversationHistory component for the
 * dedicated `/history` view. The drawer entry-point is preserved on the
 * chat composer for quick switching; this page is for browsing,
 * filtering, and bulk operations.
 *
 * Mock-backed fields (see design_update.md Phase 4):
 *   - is_starred, is_archived, tokens_total, tools_called
 *     → from mock/conversations.ts; replace with API when backend lands.
 *   - model — the server doesn't expose the model id per conversation
 *     yet, so we hide that column for now (don't fabricate it).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Star,
  Search,
  Plus,
  Archive,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { chatApi, ConversationListItem } from '../api/client';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  PageTitle,
  Toolbar,
  Pill,
  EmptyState,
} from '../components/design';
import { cn } from '../lib/utils';
import { statsFor, formatTokens } from '../mock/conversations';

interface ConversationHistoryPageProps {
  /** Click on a row to navigate back to chat with that thread loaded. */
  onSelectConversation: (threadId: string) => void;
  /** Header "新对话" action — navigates back to chat / clears thread. */
  onNewConversation: () => void;
}

const TIME_RANGES = [
  { value: 'all', label: '任意时间' },
  { value: '1d', label: '今天' },
  { value: '7d', label: '7 天内' },
  { value: '30d', label: '30 天内' },
] as const;

const STAR_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'starred', label: '已收藏' },
  { value: 'archived', label: '已归档' },
] as const;

function parseServerTime(s: string | null | undefined): number {
  if (!s) return 0;
  const hasTz = /Z$|[+\-]\d{2}:?\d{2}$/.test(s);
  const t = new Date(hasTz ? s : s + 'Z').getTime();
  return isNaN(t) ? 0 : t;
}

function formatRelative(s: string | null | undefined): string {
  const ts = parseServerTime(s);
  if (!ts) return '——';
  const now = Date.now();
  const diff = (now - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}

export const ConversationHistoryPage: React.FC<ConversationHistoryPageProps> = ({
  onSelectConversation,
  onNewConversation,
}) => {
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<typeof TIME_RANGES[number]['value']>('all');
  const [starFilter, setStarFilter] = useState<typeof STAR_FILTERS[number]['value']>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadConversations = async (p = 1, append = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await chatApi.listConversations(p, 30);
      setConversations((prev) => (append ? [...prev, ...res.items] : res.items));
      setHasMore(res.has_more);
      setPage(p);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: err?.response?.data?.detail || err?.message || '请稍后再试',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadConversations(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sort + filter + search live entirely client-side. The list endpoint
  // pages by 30; "load more" appends until `has_more` is false.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cutoff =
      timeRange === '1d'
        ? Date.now() - 86400 * 1000
        : timeRange === '7d'
          ? Date.now() - 7 * 86400 * 1000
          : timeRange === '30d'
            ? Date.now() - 30 * 86400 * 1000
            : 0;

    return [...conversations]
      .map((c) => ({ ...c, _stats: statsFor(c) }))
      .filter((c) => {
        if (q) {
          const hay = `${c.title} ${c.last_message || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (cutoff && parseServerTime(c.updated_at || c.created_at) < cutoff) return false;
        if (starFilter === 'starred' && !c._stats.is_starred) return false;
        if (starFilter === 'archived' && !c._stats.is_archived) return false;
        return true;
      })
      .sort(
        (a, b) =>
          parseServerTime(b.updated_at || b.created_at) -
          parseServerTime(a.updated_at || a.created_at),
      );
  }, [conversations, searchQuery, timeRange, starFilter]);

  const handleDelete = (c: ConversationListItem) => {
    showConfirm({
      title: '确认删除',
      description: `确定要删除对话"${c.title}"吗？此操作无法撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await chatApi.deleteConversation(c.thread_id);
          setConversations((prev) => prev.filter((x) => x.id !== c.id));
          toast({ variant: 'success', title: '已删除' });
        } catch (err: any) {
          toast({
            variant: 'destructive',
            title: '删除失败',
            description: err?.response?.data?.detail || err?.message || '请稍后再试',
          });
        }
      },
    });
  };

  // Star/archive rely on backend fields that don't exist yet — Phase 4.
  // Until then, the actions are visible but call out the limitation.
  const handleStarToggle = () => {
    toast({
      title: '收藏功能即将开放',
      description: '后端尚未支持持久化收藏标记；当前的 ☆ 仅用于演示。',
    });
  };

  const handleArchive = () => {
    toast({
      title: '归档功能即将开放',
      description: '后端尚未支持归档；先用搜索 + 删除替代。',
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        {/* Full-bleed content area — fills whatever the Layout pane gives
            us. Padding alone sets the page gutters; no max-width cap so
            the table runs from the sidebar edge to the right edge. */}
        <div className="w-full px-6 pt-6 pb-12">
          <PageTitle
            title="对话历史"
            description="查看、检索、归档你与 Agent 的所有会话。删除对话不会撤销已执行的工具操作。"
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  className="gap-1.5"
                >
                  <Archive className="h-3.5 w-3.5" />
                  归档全部
                </Button>
                <Button size="sm" onClick={onNewConversation} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  新对话
                </Button>
              </>
            }
          />

          <Toolbar>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标题、消息内容…"
                className="h-8 pl-8 text-[12.5px]"
              />
            </div>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
              <SelectTrigger className="h-8 w-[110px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={starFilter} onValueChange={(v) => setStarFilter(v as any)}>
              <SelectTrigger className="h-8 w-[100px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAR_FILTERS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto text-[11.5px] text-muted-foreground">
              共 {filtered.length} 条
            </div>
          </Toolbar>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={searchQuery || timeRange !== 'all' || starFilter !== 'all' ? '没有匹配的对话' : '暂无对话历史'}
              description={
                searchQuery || timeRange !== 'all' || starFilter !== 'all'
                  ? '调整筛选条件再试一次。'
                  : '在对话页面发送一条消息即可开始。'
              }
              action={
                searchQuery || timeRange !== 'all' || starFilter !== 'all' ? null : (
                  <Button size="sm" onClick={onNewConversation} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    新对话
                  </Button>
                )
              }
            />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Fixed layout so cell widths come from <colgroup>, not from
                  the longest content. The "会话" column is the only `auto`
                  column — it absorbs all extra width on wide screens and
                  truncates on narrow ones, while the metric columns stay
                  pinned to readable widths. */}
              <Table className="table-fixed">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[80px]" />
                  <col className="w-[110px]" />
                  <col className="w-10" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-9 px-3"></TableHead>
                    <TableHead className="h-9 px-3">会话</TableHead>
                    <TableHead className="h-9 px-3">工具 / 消息</TableHead>
                    <TableHead className="h-9 px-3 text-right">TOKENS</TableHead>
                    <TableHead className="h-9 px-3">更新于</TableHead>
                    <TableHead className="h-9 px-3"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      onClick={() => onSelectConversation(c.thread_id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStarToggle();
                          }}
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded transition-colors',
                            c._stats.is_starred
                              ? 'text-chart-4 hover:text-chart-4'
                              : 'text-muted-foreground/50 hover:text-foreground',
                          )}
                          title={c._stats.is_starred ? '取消收藏' : '收藏'}
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              c._stats.is_starred && 'fill-current',
                            )}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="min-w-0 px-3 py-1.5">
                        <div className="flex min-w-0 flex-col">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-foreground">
                              {c.title || '未命名对话'}
                            </span>
                            {c._stats.is_archived && (
                              <Pill tone="outline">已归档</Pill>
                            )}
                          </div>
                          {c.last_message && (
                            <span className="truncate text-[11.5px] leading-tight text-muted-foreground">
                              {c.last_message}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                        {c._stats.tools_called}·{c.message_count}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                        {formatTokens(c._stats.tokens_total)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                        {formatRelative(c.updated_at || c.created_at)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => onSelectConversation(c.thread_id)}>
                              打开
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleStarToggle}>
                              {c._stats.is_starred ? '取消收藏' : '收藏'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleArchive}>归档</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(c)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {hasMore && filtered.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => loadConversations(page + 1, true)}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    加载中...
                  </>
                ) : (
                  '加载更多'
                )}
              </Button>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            归档的对话会保留 90 天，之后将被永久删除。审计日志由超管单独保存。
          </div>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
};

export default ConversationHistoryPage;
