import React, { useState, useEffect } from 'react';
import { userApi, UserFile, WorkspaceInfo } from '../api/user';
import {
  Upload, Download, Trash2, File, FileText,
  Image as ImageIcon, Video, Music, Archive, Code,
  Loader2, HardDrive, FolderOpen, Sparkles, FlaskConical, Files, Paperclip, Link2, Copy, Eye,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';
import { cn } from '../lib/utils';

export const UserFilesManager: React.FC = () => {
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [sortBy, setSortBy] = useState<'time-desc' | 'time-asc' | 'name' | 'size'>('time-desc');
  const [previewFile, setPreviewFile] = useState<UserFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadFiles = async (fileType: string = '') => {
    setLoading(true);
    try {
      const data = await userApi.listFiles(fileType || undefined);
      setFiles(data);
    } catch (error) {
      toast({ variant: "destructive", title: "加载失败", description: "无法加载文件列表" });
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspaceInfo = async () => {
    try { setWorkspaceInfo(await userApi.getWorkspaceInfo()); } catch {}
  };

  useEffect(() => {
    loadFiles(selectedFileType);
    loadWorkspaceInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFileType]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await userApi.uploadFile(file, selectedFileType || 'files', '');
      toast({ variant: "success", title: "上传成功", description: `${file.name} 已上传` });
      loadFiles(selectedFileType);
      loadWorkspaceInfo();
    } catch {
      toast({ variant: "destructive", title: "上传失败", description: "请检查文件大小和格式" });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = (fileId: number, filename: string) => {
    showConfirm({
      title: '确认删除',
      description: `确定要删除文件"${filename}"吗？此操作无法撤销。`,
      confirmText: '删除', variant: 'danger',
      onConfirm: async () => {
        try {
          await userApi.deleteFile(fileId);
          toast({ variant: "success", title: "删除成功" });
          loadFiles(selectedFileType);
          loadWorkspaceInfo();
        } catch {
          toast({ variant: "destructive", title: "删除失败" });
        }
      },
    });
  };

  const handleDownload = async (file: UserFile) => {
    try { await userApi.downloadFile(file.id, file.filename); }
    catch { toast({ variant: "destructive", title: "下载失败" }); }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN');

  // 文件图标使用 chart 配色
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || ''))
      return <ImageIcon className="w-5 h-5 text-chart-4" />;
    if (['mp4', 'avi', 'mov', 'webm'].includes(ext || ''))
      return <Video className="w-5 h-5 text-chart-5" />;
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext || ''))
      return <Music className="w-5 h-5 text-chart-2" />;
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext || ''))
      return <Archive className="w-5 h-5 text-chart-3" />;
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(ext || ''))
      return <Code className="w-5 h-5 text-chart-1" />;
    if (['txt', 'md', 'doc', 'docx', 'pdf'].includes(ext || ''))
      return <FileText className="w-5 h-5 text-muted-foreground" />;
    return <File className="w-5 h-5 text-muted-foreground" />;
  };

  const storagePercent = workspaceInfo
    ? Math.min((workspaceInfo.used_storage_mb / workspaceInfo.max_storage_mb) * 100, 100)
    : 0;

  const fileTypeTabs = [
    { id: '', icon: FolderOpen, label: '全部' },
    { id: 'files', icon: Files, label: '上传' },
    { id: 'generated', icon: Sparkles, label: '生成' },
    { id: 'sandbox', icon: FlaskConical, label: '沙箱' },
    { id: 'assets', icon: Paperclip, label: '素材' },
  ];

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const getAssetUrl = (file: { id: number; asset_url?: string | null }) =>
    file.asset_url ? `${API_BASE}${file.asset_url}` : '';

  const copyAssetUrl = (file: { id: number; asset_url?: string | null }) => {
    const url = getAssetUrl(file);
    if (!url) {
      toast({ title: '无法复制', description: '此文件不支持公开链接' });
      return;
    }
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url);
      } else {
        const range = document.createRange();
        const span = document.createElement('span');
        span.textContent = url;
        span.style.cssText = 'position:fixed;top:0;left:0;opacity:0;white-space:pre';
        document.body.appendChild(span);
        range.selectNodeContents(span);
        const sel = window.getSelection();
        sel?.removeAllRanges(); sel?.addRange(range);
        try { document.execCommand('copy'); } catch { toast({ variant: 'destructive', title: '复制失败', description: '请手动选择链接复制' }); return; }
        sel?.removeAllRanges(); document.body.removeChild(span);
      }
    } catch { toast({ variant: 'destructive', title: '复制失败', description: '请手动选择链接复制' }); return; }
    toast({ title: '链接已复制', description: '12小时内可无认证访问' });
  };

  const getFileExt = (name: string) => name.split('.').pop()?.toLowerCase() || '';

  const getPreviewType = (name: string): 'image' | 'video' | 'audio' | 'markdown' | 'pdf' | 'text' | 'none' => {
    const ext = getFileExt(name);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
    if (['md', 'markdown'].includes(ext)) return 'markdown';
    if (ext === 'pdf') return 'pdf';
    if (['txt', 'log', 'json', 'xml', 'yaml', 'yml', 'csv', 'js', 'ts', 'py', 'java', 'go', 'rs', 'html', 'css'].includes(ext)) return 'text';
    return 'none';
  };

  const MAX_PREVIEW_SIZE = 200 * 1024 * 1024; // 200MB

  const handlePreview = async (file: UserFile) => {
    const type = getPreviewType(file.filename);
    if (type === 'none') {
      toast({ title: '不支持预览', description: '该文件类型暂不支持预览' });
      return;
    }
    if (file.size_bytes > MAX_PREVIEW_SIZE) {
      toast({ title: '文件过大', description: `超过 200MB 的文件不支持在线预览，请下载后查看` });
      return;
    }

    setPreviewFile(file);
    setPreviewContent('');
    setPreviewLoading(true);

    try {
      if (type === 'markdown' || type === 'text') {
        const text = await userApi.downloadFileRaw(file.id);
        setPreviewContent(text);
      } else {
        // Fetch as blob via authenticated API, create object URL
        const blob = await userApi.downloadFileBlob(file.id);
        const blobUrl = URL.createObjectURL(blob);
        setPreviewContent(blobUrl);
      }
    } catch {
      setPreviewContent('');
      toast({ variant: 'destructive', title: '加载失败' });
      setPreviewFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Cleanup blob URL when preview closes
  const closePreview = () => {
    if (previewContent && previewContent.startsWith('blob:')) {
      URL.revokeObjectURL(previewContent);
    }
    setPreviewFile(null);
    setPreviewContent('');
  };

  const sortedFiles = [...files].sort((a, b) => {
    if (sortBy === 'name') return (a.filename || '').localeCompare(b.filename || '');
    if (sortBy === 'size') return (b.size_bytes || 0) - (a.size_bytes || 0);
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return sortBy === 'time-asc' ? ta - tb : tb - ta;
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header: stats + upload */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            共 {files.length} 个文件
          </p>
          {workspaceInfo && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <p className="text-sm text-muted-foreground">
                {workspaceInfo.used_storage_mb.toFixed(1)} / {workspaceInfo.max_storage_mb} MB
              </p>
            </>
          )}
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="time-desc">最新优先</SelectItem>
              <SelectItem value="time-asc">最早优先</SelectItem>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="size">按大小</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label>
          <input type="file" onChange={handleFileUpload} disabled={uploading} className="hidden" />
          <Button disabled={uploading} asChild>
            <span className="cursor-pointer">
              {uploading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />上传中...</>
                : <><Upload className="w-4 h-4 mr-2" />上传文件</>}
            </span>
          </Button>
        </label>
      </div>

      {/* Storage bar + Tabs */}
      {workspaceInfo && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>存储空间</span>
            <span>{storagePercent.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                storagePercent > 90 ? "bg-chart-5" : storagePercent > 70 ? "bg-chart-4" : "bg-primary"
              )}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* File Type Tabs */}
      <div className="flex gap-1 mb-6">
        {fileTypeTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              variant={selectedFileType === tab.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedFileType(tab.id)}
            >
              <Icon className="w-4 h-4 mr-1.5" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Files */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        </div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">暂无文件</h3>
            <p className="text-muted-foreground">点击右上角"上传文件"开始使用</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedFiles.map((file) => (
            <Card key={file.id} className="flex flex-col transition-all hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {getFileIcon(file.filename)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm truncate">{file.filename}</CardTitle>
                    <CardDescription className="text-xs">
                      {formatFileSize(file.size_bytes)} · {formatDate(file.created_at)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 pb-3">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{file.file_type}</Badge>
                </div>
                {file.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{file.description}</p>
                )}
              </CardContent>
              <Separator />
              <div className="flex items-center justify-end gap-1 p-3">
                {getPreviewType(file.filename) !== 'none' && (
                  <Button variant="ghost" size="sm" onClick={() => handlePreview(file)}>
                    <Eye className="w-4 h-4 mr-1.5" />
                    预览
                  </Button>
                )}
                {file.file_type === 'assets' && (
                  <Button variant="ghost" size="sm" onClick={() => copyAssetUrl(file)}>
                    <Link2 className="w-4 h-4 mr-1.5" />
                    复制链接
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleDownload(file)}>
                  <Download className="w-4 h-4 mr-1.5" />
                  下载
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(file.id, file.filename)}
                  className="text-chart-5 hover:text-chart-5"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  删除
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{previewFile?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewFile && (() => {
              const type = getPreviewType(previewFile.filename);

              switch (type) {
                case 'image':
                  return (
                    <div className="flex items-center justify-center p-4">
                      <img src={previewContent} alt={previewFile.filename} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
                    </div>
                  );
                case 'video':
                  return (
                    <div className="p-4">
                      <video src={previewContent} controls className="w-full max-h-[70vh] rounded-lg">
                        您的浏览器不支持视频播放
                      </video>
                    </div>
                  );
                case 'audio':
                  return (
                    <div className="flex items-center justify-center p-8">
                      <audio src={previewContent} controls className="w-full" />
                    </div>
                  );
                case 'pdf':
                  return (
                    <iframe src={previewContent} className="w-full h-[70vh] rounded-lg border" title={previewFile.filename} />
                  );
                case 'markdown':
                  return (
                    <div className="p-6 prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{previewContent}</ReactMarkdown>
                    </div>
                  );
                case 'text':
                  return (
                    <pre className="p-4 m-4 bg-muted rounded-lg text-sm font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap break-words">
                      {previewContent}
                    </pre>
                  );
                default:
                  return null;
              }
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
};
