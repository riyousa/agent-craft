/**
 * API Keys — full-page management view (Phase 1.7).
 *
 * Replaces the legacy ApiKeyDialog modal-only flow. Layout matches
 * the v3 design (screens-user.jsx:785-883):
 *   - PageHeader breadcrumb '工作区 / API Key'
 *   - PageTitle "API Key" + 「创建 API Key」 action
 *   - Just-created key callout (green tinted) with show/copy/close
 *     for the one-time-only full key reveal
 *   - Table: 名称 / KEY / 权限 / 创建于 / 最近使用 / 状态 / 操作
 *   - Footer security note
 *
 * The legacy ApiKeyDialog stays mounted in the sidebar footer dropdown
 * for one-click access; this page is for batch management.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  MoreHorizontal,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  listApiKeys,
  createApiKey,
  deleteApiKey,
  ApiKeyInfo,
  ApiKeyCreated,
} from '../api/auth';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  PageHeader,
  PageTitle,
  Pill,
  EmptyState,
} from '../components/design';
import { cn } from '../lib/utils';

interface ApiKeysPageProps {
  /** Used by the breadcrumb's "工作区" crumb to jump back to chat. */
  onNavigateHome?: () => void;
}

function formatDate(s?: string | null): string {
  if (!s) return '——';
  return new Date(s).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatRelative(s?: string | null): string {
  if (!s) return '从未使用';
  const ts = new Date(s).getTime();
  if (isNaN(ts)) return '——';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export const ApiKeysPage: React.FC<ApiKeysPageProps> = ({ onNavigateHome }) => {
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const navigate = useNavigate();

  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  // One-time-display key returned by the create endpoint. Lives only
  // in component state; cleared on dismiss or page leave.
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAutoApprove, setNewAutoApprove] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: err?.response?.data?.detail || err?.message || '请稍后再试',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedKeys = useMemo(() => {
    // Sort: active first, then by created_at desc.
    return [...keys].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [keys]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const key = await createApiKey(newName.trim(), newAutoApprove);
      setCreatedKey(key);
      setShowCreatedKey(true);
      setNewName('');
      setNewAutoApprove(false);
      setCreateOpen(false);
      await loadKeys();
      toast({
        variant: 'success',
        title: 'API Key 已创建',
        description: '请立即复制；关闭后将无法再次查看。',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '创建失败',
        description: err?.response?.data?.detail || err?.message || '请稍后再试',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (key: ApiKeyInfo) => {
    showConfirm({
      title: '删除 API Key',
      description: `确定删除 "${key.name}" (${key.key_prefix}...)？使用此 Key 的外部应用将立即失效。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteApiKey(key.id);
          toast({ variant: 'success', title: '已删除' });
          await loadKeys();
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

  // Cross-browser clipboard with execCommand fallback (HTTP origins).
  const copyText = (text: string) => {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast({ title: '已复制' }));
      return;
    }
    const span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = 'position:fixed;top:0;left:0;opacity:0;white-space:pre';
    document.body.appendChild(span);
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    try {
      document.execCommand('copy');
      toast({ title: '已复制' });
    } catch {
      toast({
        variant: 'destructive',
        title: '复制失败',
        description: '请手动选择文本复制 (Ctrl+C)',
      });
    }
    sel?.removeAllRanges();
    document.body.removeChild(span);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        breadcrumb={['工作区', 'API Key']}
        subtitle={`共 ${keys.length} 把`}
        onCrumbClick={(i) => {
          if (i === 0 && onNavigateHome) onNavigateHome();
        }}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/api-docs')}
            className="h-7 gap-1.5 px-2 text-[12px]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            接口文档
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-7 pt-6 pb-12">
          <PageTitle
            title="API Key"
            description="使用 API Key 通过 HTTPS / SDK 程序化访问你的 Agent。Key 仅在创建时显示一次，请妥善保存。"
            actions={
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                创建 API Key
              </Button>
            }
          />

          {/* Just-created key callout — only shown once after create. */}
          {createdKey && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-chart-2/40 bg-chart-2/5 p-3.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-chart-2 text-background">
                <Check className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-foreground">
                  {createdKey.name} 已创建
                </div>
                <div className="mb-2 mt-0.5 text-[11.5px] text-muted-foreground">
                  请立即复制并保存这个 Key，关闭后将不会再次显示。
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-mono text-[12px]">
                  <span className="flex-1 select-all overflow-hidden text-ellipsis whitespace-nowrap">
                    {showCreatedKey
                      ? createdKey.full_key
                      : `${createdKey.key_prefix}${'•'.repeat(28)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCreatedKey(!showCreatedKey)}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={showCreatedKey ? '隐藏' : '显示'}
                  >
                    {showCreatedKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(createdKey.full_key)}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="复制"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreatedKey(null);
                  setShowCreatedKey(false);
                }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : keys.length === 0 ? (
            <EmptyState
              title="还没有 API Key"
              description="创建一个 Key，即可通过 HTTPS / SDK 程序化访问你的 Agent。"
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  创建 API Key
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table className="table-fixed min-w-[760px]">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[22%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[4%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-9 px-3">名称</TableHead>
                    <TableHead className="h-9 px-3">KEY</TableHead>
                    <TableHead className="h-9 px-3">权限</TableHead>
                    <TableHead className="h-9 px-3">创建于</TableHead>
                    <TableHead className="h-9 px-3">最近使用</TableHead>
                    <TableHead className="h-9 px-3">状态</TableHead>
                    <TableHead className="h-9 px-3"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedKeys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="min-w-0 px-3 py-1.5">
                        <span
                          className={cn(
                            'truncate text-[13px] font-medium',
                            k.is_active ? 'text-foreground' : 'text-muted-foreground line-through',
                          )}
                        >
                          {k.name}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                        {k.key_prefix}••••••
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {k.auto_approve ? (
                          <Pill tone="warning" dot>自动审批</Pill>
                        ) : (
                          <Pill tone="info" dot>需审批</Pill>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                        {formatDate(k.created_at)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                        {formatRelative(k.last_used_at)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {k.is_active ? (
                          <Pill tone="success" dot>有效</Pill>
                        ) : (
                          <Pill tone="neutral" dot>已撤销</Pill>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => copyText(k.key_prefix)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              复制前缀
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(k)}
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

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[12px] leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              不要将 API Key 提交到代码仓库。建议使用环境变量或密钥管理服务保存。
              <span className="ml-1">
                需要查看完整接入示例？
                <button
                  type="button"
                  onClick={() => navigate('/api-docs')}
                  className="ml-1 text-foreground underline-offset-2 hover:underline"
                >
                  打开接口文档 →
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Create dialog — small modal driven from the page header CTA. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建 API Key</DialogTitle>
            <DialogDescription>
              起一个能让你认出来的名字，比如「本地开发」或「CI/CD」。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">名称</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim() && !creating) handleCreate();
                }}
                autoFocus
                placeholder="例如：production-bot"
                className="h-9 text-[13px]"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 hover:bg-accent">
              <input
                type="checkbox"
                checked={newAutoApprove}
                onChange={(e) => setNewAutoApprove(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded"
              />
              <div className="flex-1 text-[12.5px]">
                <div className="font-medium text-foreground">自动审批</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">
                  使用此 Key 时跳过工具/技能的人工确认，适用于自动化脚本。仅在你完全信任的环境中开启。
                </div>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="gap-1.5"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {creating ? '创建中…' : '创建'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
};

export default ApiKeysPage;
