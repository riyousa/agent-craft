import React, { useState, useEffect } from 'react';
import { chatApi, ConversationListItem } from '../api/client';
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useConfirmDialog } from './ui/confirm-dialog';

interface ConversationSidebarProps {
  currentThreadId: string;
  onSelectConversation: (threadId: string) => void;
  onNewConversation: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  currentThreadId,
  onSelectConversation,
  onNewConversation,
}) => {
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const res = await chatApi.listConversations(1, 100);
      setConversations(res.items);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
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
          // 如果删除的是当前对话，创建新对话
          if (conversation.thread_id === currentThreadId) {
            onNewConversation();
          }
        } catch (error) {
          console.error('Failed to delete conversation:', error);
        }
      },
    });
  };

  const handleStartEdit = (conversation: ConversationListItem) => {
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

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '未知时间';

    const date = new Date(dateString);
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

  if (!isOpen) {
    return (
      <div className="flex flex-col items-center py-4 px-2 border-r">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} title="展开侧边栏" aria-label="展开侧边栏">
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewConversation} title="新建对话" aria-label="新建对话" className="mt-4">
          <Plus className="w-5 h-5 text-primary" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-64 border-r">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">对话历史</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewConversation} title="新建对话" aria-label="新建对话">
            <Plus className="w-4 h-4 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)} title="收起侧边栏" aria-label="收起侧边栏">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">暂无对话</p>
            <p className="text-xs mt-1 text-muted-foreground/70">点击上方 + 创建新对话</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group relative rounded-lg p-3 cursor-pointer transition-all ${
                  conv.thread_id === currentThreadId
                    ? 'bg-accent'
                    : 'hover:bg-accent'
                }`}
                onClick={() => onSelectConversation(conv.thread_id)}
              >
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle(conv);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="flex-1 h-7 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSaveTitle(conv)} aria-label="保存标题">
                      <Check className="w-3 h-3 text-chart-2" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancelEdit} aria-label="取消编辑">
                      <X className="w-3 h-3 text-chart-5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3
                        className="text-sm font-medium truncate flex-1"
                                             >
                        {conv.title || '新对话'}
                      </h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(conv);
                          }}
                          title="编辑标题"
                          aria-label="编辑标题"
                        >
                          <Edit2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(conv);
                          }}
                          title="删除对话"
                          aria-label="删除对话"
                        >
                          <Trash2 className="w-3 h-3 text-chart-5" />
                        </Button>
                      </div>
                    </div>
                    <p
                      className="text-xs truncate mb-1 text-muted-foreground"
                    >
                      {conv.last_message || '暂无消息'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                      <span>{conv.message_count} 条消息</span>
                      <span>{formatDate(conv.updated_at)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
};
