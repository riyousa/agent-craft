import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Plus, Trash2, Copy, Eye, EyeOff, Key, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listApiKeys, createApiKey, deleteApiKey, ApiKeyInfo, ApiKeyCreated } from '../api/auth';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const navigate = useNavigate();

  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyAutoApprove, setNewKeyAutoApprove] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const loadApiKeys = useCallback(async () => {
    try { setApiKeys(await listApiKeys()); } catch {}
  }, []);

  useEffect(() => {
    if (open) { loadApiKeys(); setCreatedKey(null); }
  }, [open, loadApiKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setKeyLoading(true);
    try {
      const key = await createApiKey(newKeyName.trim(), newKeyAutoApprove);
      setCreatedKey(key);
      setNewKeyName('');
      setNewKeyAutoApprove(false);
      setShowKey(true);
      loadApiKeys();
      toast({ title: 'API Key 已创建', description: '请立即复制，关闭后无法再次查看' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: '创建失败', description: err.response?.data?.detail || err.message });
    } finally { setKeyLoading(false); }
  };

  const handleDelete = (key: ApiKeyInfo) => {
    showConfirm({
      title: '删除 API Key',
      description: `确定删除 "${key.name}" (${key.key_prefix}...)？使用此 Key 的外部应用将立即失效。`,
      confirmText: '删除',
      variant: 'danger',
      onConfirm: async () => {
        await deleteApiKey(key.id);
        loadApiKeys();
        toast({ title: '已删除' });
      },
    });
  };

  const copy = (text: string) => {
    // Method 1: Clipboard API (HTTPS only)
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast({ title: '已复制' }));
      return;
    }
    // Method 2: execCommand with selection range
    const range = document.createRange();
    const span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = 'position:fixed;top:0;left:0;opacity:0;white-space:pre';
    document.body.appendChild(span);
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    try {
      document.execCommand('copy');
      toast({ title: '已复制' });
    } catch {
      toast({ variant: 'destructive', title: '复制失败', description: '请手动选择文本复制 (Ctrl+C)' });
    }
    sel?.removeAllRanges();
    document.body.removeChild(span);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" /> API Key 管理
          </DialogTitle>
          <DialogDescription>
            通过 API Key 调用 <code className="bg-muted px-1 rounded">/chat</code> 和 <code className="bg-muted px-1 rounded">/chat/stream</code> 接口
          </DialogDescription>
        </DialogHeader>

        {/* Usage hint + docs link */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md font-mono space-y-1">
          <div>curl -X POST {'{host}'}/api/v1/chat/stream \</div>
          <div className="pl-4">-H "Authorization: Bearer sk-xxx" \</div>
          <div className="pl-4">-H "Content-Type: application/json" \</div>
          <div className="pl-4">{'-d \'{"thread_id":"t1","message":"你好"}\''}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => { onOpenChange(false); navigate('/api-docs'); }}
        >
          <BookOpen className="w-3.5 h-3.5" />
          查看完整接口文档
        </Button>

        <Separator />

        {/* Created key */}
        {createdKey && (
          <div className="p-3 rounded-md border border-chart-4/30 bg-chart-4/5 space-y-2">
            <p className="text-xs font-medium text-chart-4">请立即复制，关闭后将无法再次查看</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all select-all">
                {showKey ? createdKey.full_key : createdKey.key_prefix + '•'.repeat(32)}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copy(createdKey.full_key)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Create */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key 名称（如: 测试脚本）"
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button size="sm" className="h-9" onClick={handleCreate} disabled={keyLoading || !newKeyName.trim()}>
              <Plus className="w-3.5 h-3.5 mr-1" />创建
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={newKeyAutoApprove}
              onChange={(e) => setNewKeyAutoApprove(e.target.checked)}
              className="rounded"
            />
            自动审批（跳过工具/技能的人工确认，适用于自动化脚本）
          </label>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无 API Key</p>
          ) : (
            apiKeys.map(k => (
              <div key={k.id} className="flex items-center justify-between p-2.5 rounded-md border text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{k.name}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    <code>{k.key_prefix}...</code>
                    {k.auto_approve && <span className="text-chart-4 font-medium">自动审批</span>}
                    {k.last_used_at && <span>最近: {new Date(k.last_used_at).toLocaleDateString('zh-CN')}</span>}
                    {k.created_at && <span>创建: {new Date(k.created_at).toLocaleDateString('zh-CN')}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-chart-5 hover:text-chart-5"
                  onClick={() => handleDelete(k)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog />
    </>
  );
};
