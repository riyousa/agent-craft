import React, { useState, useEffect, useMemo } from 'react';
import { chatApi, ConversationListItem } from '../api/client';
import {
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  Clock,
  MessageCircle,
  ArrowUpDown,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useConfirmDialog } from './ui/confirm-dialog';
import { cn } from '../lib/utils';

interface ConversationHistoryProps {
  /** When 'sidebar', renders inline without a Dialog wrapper and auto-loads on mount. */
  variant?: 'modal' | 'sidebar';
  isOpen?: boolean;
  onClose?: () => void;
  currentThreadId: string;
  onSelectConversation: (threadId: string) => void;
  refreshTrigger?: number;
  /** Sidebar-mode optional header slot (e.g. a "新对话" button). */
  sidebarHeaderAction?: React.ReactNode;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  variant = 'modal',
  isOpen,
  onClose,
  currentThreadId,
  onSelectConversation,
  refreshTrigger,
  sidebarHeaderAction,
}) => {
  const isSidebar = variant === 'sidebar';
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [sortBy, setSortBy] = useState<string>('time-desc');

  // Same UTC-coercion trick as formatDate — without it ordering is correct
  // (all rows shifted by the same 8h) but adding new conversations during the
  // same browser session would compare TZ-tagged "Date.now()" against shifted
  // UTC strings.
  const parseServerTime = (s: string | null | undefined): number => {
    if (!s) return 0;
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
    const t = new Date(hasTz ? s : s + 'Z').getTime();
    return isNaN(t) ? 0 : t;
  };

  const sortedConversations = useMemo(() => {
    const sorted = [...conversations];
    switch (sortBy) {
      case 'time-desc':
        sorted.sort((a, b) => parseServerTime(b.updated_at) - parseServerTime(a.updated_at));
        break;
      case 'time-asc':
        sorted.sort((a, b) => parseServerTime(a.updated_at) - parseServerTime(b.updated_at));
        break;
      case 'messages':
        sorted.sort((a, b) => (b.message_count || 0) - (a.message_count || 0));
        break;
      case 'title':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
        break;
    }
    return sorted;
  }, [conversations, sortBy]);

  useEffect(() => {
    // Sidebar mode: always loaded; modal mode: only when opened.
    if (isSidebar || isOpen) {
      loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSidebar, isOpen, refreshTrigger]);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadConversations = async (p = 1, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await chatApi.listConversations(p, 20);
      setConversations(prev => append ? [...prev, ...res.items] : res.items);
      setHasMore(res.has_more);
      setPage(p);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleDelete = (conversation: ConversationListItem) => {
    showConfirm({
      title: '确认删除',
      description: `确定要删除对话"${conversation.title}"吗？此操作无法撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await chatApi.deleteConversation(conversation.thread_id);
          loadConversations();
        } catch (error) {
          console.error('Failed to delete conversation:', error);
        }
      },
    });
  };

  const handleStartEdit = (conversation: ConversationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveTitle = async (conversation: ConversationListItem) => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      try {
        await chatApi.updateConversationTitle(conversation.thread_id, editTitle.trim());
        loadConversations();
      } catch (error) {
        console.error('Failed to update title:', error);
      }
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleSelectConversation = (threadId: string) => {
    onSelectConversation(threadId);
    // In sidebar mode the panel stays open — only the modal auto-closes.
    if (!isSidebar) onClose?.();
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '未知时间';

    // Backend stores naive datetimes (server is UTC inside the container)
    // and serializes them WITHOUT a timezone marker, e.g. "2026-04-24T10:00:00".
    // Browser's Date() treats such strings as local time → in a CST (UTC+8)
    // browser the parsed instant is 8h earlier than reality, so the relative
    // formatter below would print "8小时前". Force UTC interpretation by
    // appending Z when no offset is present.
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dateString);
    const date = new Date(hasTz ? dateString : dateString + 'Z');
    if (isNaN(date.getTime())) return '未知时间';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // Inner conversation list — shared by modal and sidebar variants.
  const renderConversationList = (compact: boolean) => (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className={cn(
            "rounded-full bg-muted flex items-center justify-center mb-4",
            compact ? "w-12 h-12" : "w-16 h-16"
          )}>
            <MessageCircle className={cn(compact ? "w-6 h-6" : "w-8 h-8", "text-muted-foreground")} />
          </div>
          <p className={cn(compact ? "text-sm" : "text-base", "font-medium mb-1")}>暂无对话历史</p>
          {!compact && (
            <p className="text-sm text-muted-foreground">开始新对话后会显示在这里</p>
          )}
        </div>
      ) : (
        <div className={cn(compact ? "space-y-1 pb-3" : "space-y-2 pb-6")}>
          {sortedConversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group relative cursor-pointer transition-all border",
                compact ? "rounded-lg p-2.5" : "rounded-xl p-4",
                conv.thread_id === currentThreadId
                  ? 'bg-primary/5 border-primary/20'
                  : 'hover:bg-muted/50 border-transparent'
              )}
              onClick={() => handleSelectConversation(conv.thread_id)}
            >
              {editingId === conv.id ? (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle(conv);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className={cn("flex-1", compact && "h-7 text-xs")}
                    autoFocus
                  />
                  <Button
                    onClick={() => handleSaveTitle(conv)}
                    size="icon"
                    variant="ghost"
                    className={cn(compact ? "h-7 w-7" : "h-8 w-8")}
                  >
                    <Check className="w-4 h-4 text-chart-2" />
                  </Button>
                  <Button
                    onClick={handleCancelEdit}
                    size="icon"
                    variant="ghost"
                    className={cn(compact ? "h-7 w-7" : "h-8 w-8")}
                  >
                    <X className="w-4 h-4 text-chart-5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className={cn("flex items-start justify-between gap-2", compact ? "mb-1" : "mb-2 gap-3")}>
                    <div className="flex-1 min-w-0">
                      <div className={cn("flex items-center gap-2", compact ? "" : "mb-1")}>
                        <h3 className={cn(
                          "font-semibold truncate",
                          compact ? "text-sm" : "text-base"
                        )}>
                          {conv.title || '新对话'}
                        </h3>
                        {conv.thread_id === currentThreadId && !compact && (
                          <Badge variant="secondary" className="text-xs">当前</Badge>
                        )}
                      </div>
                      {!compact && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {conv.last_message || '暂无消息'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        onClick={(e) => handleStartEdit(conv, e)}
                        size="icon"
                        variant="ghost"
                        className={cn(compact ? "h-6 w-6" : "h-8 w-8")}
                      >
                        <Edit2 className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conv);
                        }}
                        size="icon"
                        variant="ghost"
                        className={cn(compact ? "h-6 w-6" : "h-8 w-8", "text-chart-5 hover:text-chart-5")}
                      >
                        <Trash2 className={cn(compact ? "w-3 h-3" : "w-4 h-4")} />
                      </Button>
                    </div>
                  </div>
                  <div className={cn(
                    "flex items-center text-muted-foreground",
                    compact ? "gap-2 text-[10px]" : "gap-4 text-xs mt-3"
                  )}>
                    <span className="flex items-center gap-1">
                      <MessageSquare className={cn(compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
                      {conv.message_count}{compact ? '' : ' 条消息'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className={cn(compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
                      {formatDate(conv.updated_at)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadConversations(page + 1, true)}
                disabled={loadingMore}
                className={compact ? "text-xs h-7" : ""}
              >
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                {loadingMore ? '加载中...' : '加载更多'}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Sidebar mode: inline panel, compact list, no Dialog wrapper.
  if (isSidebar) {
    return (
      <>
        <div className="h-full flex flex-col">
          {sidebarHeaderAction && (
            <div className="px-2.5 pt-2.5 pb-2 border-b border-border/40">
              {sidebarHeaderAction}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border/40">
            <span className="text-xs text-muted-foreground">
              {conversations.length} 条
            </span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs border-0 bg-transparent shadow-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-muted text-muted-foreground [&>svg]:opacity-50">
                <ArrowUpDown className="w-3 h-3" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="time-desc">最近更新</SelectItem>
                <SelectItem value="time-asc">最早更新</SelectItem>
                <SelectItem value="messages">消息最多</SelectItem>
                <SelectItem value="title">标题排序</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-2 pt-2">
              {renderConversationList(true)}
            </div>
          </ScrollArea>
        </div>
        <ConfirmDialog />
      </>
    );
  }

  // Modal mode: original Dialog presentation.
  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xl font-semibold">对话历史</div>
                  <DialogDescription className="mt-1">
                    {conversations.length} 条对话记录
                  </DialogDescription>
                </div>
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time-desc">最近更新</SelectItem>
                  <SelectItem value="time-asc">最早更新</SelectItem>
                  <SelectItem value="messages">消息最多</SelectItem>
                  <SelectItem value="title">标题排序</SelectItem>
                </SelectContent>
              </Select>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-6">
            {renderConversationList(false)}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </>
  );
};
