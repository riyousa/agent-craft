import React, { useState } from 'react';
import { chatApi } from '../api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { useToast } from '../hooks/use-toast';
import { AlertTriangle, Loader2, Sparkles, CheckCircle2, Clipboard } from 'lucide-react';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: any) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  onApply,
}) => {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tool_config: any; explanation: string } | null>(null);
  const [error, setError] = useState<string>('');

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('请输入API描述');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await chatApi.parseToolConfig(description);
      setResult(response);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'AI解析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onApply(result.tool_config);
      handleClose();
    }
  };

  const handleClose = () => {
    setDescription('');
    setResult(null);
    setError('');
    onClose();
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.tool_config, null, 2));
      toast({ title: '已复制', description: '配置已复制到剪贴板' });
    } catch {
      toast({ title: '复制失败', description: '请手动选择文本复制', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>🤖 AI配置助手</DialogTitle>
          <DialogDescription>描述您的API，AI将自动生成配置</DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <p className="font-medium mb-1">使用指南</p>
                <p className="text-sm">请详细描述您要调用的API，包括：</p>
                <ul className="list-disc pl-5 text-sm mt-1 space-y-0.5">
                  <li>API的端点URL和HTTP方法</li>
                  <li>需要什么参数（必填/选填）</li>
                  <li>如何认证（API Key、Bearer Token等）</li>
                  <li>返回数据的结构</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="grid gap-2">
              <Label htmlFor="api-description">API描述</Label>
              <Textarea
                id="api-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请详细描述您的API端点、参数、认证方式和返回数据..."
                rows={10}
                disabled={loading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={handleClose} disabled={loading}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    AI解析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    生成配置
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">配置已生成</p>
                <p className="text-sm mt-1">{result.explanation}</p>
              </AlertDescription>
            </Alert>

            <div className="rounded-md border bg-muted/50">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-medium">生成的配置</span>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  <Clipboard className="mr-2 h-3 w-3" />
                  复制
                </Button>
              </div>
              <pre className="p-3 text-xs overflow-auto max-h-80">
                {JSON.stringify(result.tool_config, null, 2)}
              </pre>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={handleClose}>取消</Button>
              <Button onClick={handleApply}>
                <Sparkles className="mr-2 h-4 w-4" />
                应用配置
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
