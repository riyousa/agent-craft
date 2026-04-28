import React, { useMemo, useState, useEffect } from 'react';
import { userApi, UserFile, WorkspaceInfo } from '../api/user';
import {
  Upload, Download, Trash2, File, FileText,
  Image as ImageIcon, Video, Music, Archive, Code,
  Loader2, HardDrive, FolderOpen, Sparkles, FlaskConical, Files, Paperclip, Link2, Copy, Eye,
  Search, MoreHorizontal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';
import { cn } from '../lib/utils';
import {
  FileThumb, PageHeader, PageTitle, Toolbar, Pill, EmptyState,
} from './design';

export const UserFilesManager: React.FC = () => {
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [sortBy, setSortBy] = useState<'time-desc' | 'time-asc' | 'name' | 'size'>('time-desc');
  const [searchQuery, setSearchQuery] = useState('');
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
        } catch (err: any) {
          // Surface the real backend reason instead of swallowing it —
          // typically file-system permission errors on the server side
          // or 404 if the row was already soft-deleted in another tab.
          const detail =
            err?.response?.data?.detail ||
            err?.message ||
            '请稍后再试';
          console.error('[UserFiles] delete failed:', err);
          toast({
            variant: 'destructive',
            title: '删除失败',
            description: detail,
          });
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

  // Filter against current search query (sortedFiles is already
  // sorted by sortBy + filtered by selectedFileType via loadFiles).
  const visibleFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedFiles;
    return sortedFiles.filter((f) => {
      const hay = `${f.filename} ${f.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sortedFiles, searchQuery]);

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        breadcrumb={['工作区', '文件']}
        subtitle={
          workspaceInfo
            ? `共 ${files.length} 项 · ${workspaceInfo.used_storage_mb.toFixed(1)} MB / ${workspaceInfo.max_storage_mb} MB`
            : `共 ${files.length} 项`
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-7 pt-6 pb-12">
          <PageTitle
            title="文件"
            description="上传文件用于 Agent 引用、解析或作为知识库片段。会话中引用的文件也会归档到此。"
            actions={
              <label>
                <input type="file" onChange={handleFileUpload} disabled={uploading} className="hidden" />
                <Button disabled={uploading} size="sm" asChild className="gap-1.5">
                  <span className="cursor-pointer">
                    {uploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        上传文件
                      </>
                    )}
                  </span>
                </Button>
              </label>
            }
          />

          {/* Storage usage card — design-spec quota row */}
          {workspaceInfo && (
            <div className="mb-5 flex items-center gap-4 rounded-lg border border-border bg-card p-3.5">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12.5px] font-medium text-foreground">存储用量</span>
                  <span className="font-mono text-[11.5px] text-muted-foreground">
                    {workspaceInfo.used_storage_mb.toFixed(1)} MB / {workspaceInfo.max_storage_mb} MB
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {storagePercent.toFixed(1)}% 已使用
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      storagePercent > 90
                        ? 'bg-destructive'
                        : storagePercent > 70
                          ? 'bg-chart-4'
                          : 'bg-foreground',
                    )}
                    style={{ width: `${Math.max(0.5, storagePercent)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* File-type tabs (全部 / 上传 / 生成 / 沙箱 / 素材) */}
          <div className="mb-4 flex flex-wrap gap-1">
            {fileTypeTabs.map((tab) => {
              const Icon = tab.icon;
              const active = selectedFileType === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant={active ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedFileType(tab.id)}
                  className="h-7 gap-1.5 text-[12px]"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Button>
              );
            })}
          </div>

          <Toolbar>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件名 / 描述…"
                className="h-8 pl-8 text-[12.5px]"
              />
            </div>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-8 w-[120px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time-desc">最新优先</SelectItem>
                <SelectItem value="time-asc">最早优先</SelectItem>
                <SelectItem value="name">按名称</SelectItem>
                <SelectItem value="size">按大小</SelectItem>
              </SelectContent>
            </Select>
          </Toolbar>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : visibleFiles.length === 0 ? (
            files.length === 0 ? (
              <EmptyState
                icon={<FolderOpen className="h-5 w-5" />}
                title="暂无文件"
                description="点击「上传文件」开始使用，或在对话里引用文件后回到这里查看。"
              />
            ) : (
              <EmptyState
                title="没有匹配的文件"
                description="调整搜索关键词或切换类型 Tab 再试一次。"
              />
            )
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table className="table-fixed min-w-[760px]">
                {/* Percentage widths so the file-name column scales
                    proportionally instead of devouring all the slack
                    space on wide displays. Sum = 100. */}
                <colgroup>
                  <col className="w-[50%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-9 px-3">文件名</TableHead>
                    <TableHead className="h-9 px-3">类型</TableHead>
                    <TableHead className="h-9 px-3 text-right">大小</TableHead>
                    <TableHead className="h-9 px-3">来源</TableHead>
                    <TableHead className="h-9 px-3">上传于</TableHead>
                    <TableHead className="h-9 px-3"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleFiles.map((file) => {
                    const ext = file.filename.split('.').pop()?.toUpperCase() || '——';
                    const sourceLabel =
                      file.file_type === 'assets'
                        ? '素材'
                        : file.file_type === 'generated'
                          ? '生成'
                          : file.file_type === 'sandbox'
                            ? '沙箱'
                            : '上传';
                    const previewable = getPreviewType(file.filename) !== 'none';
                    return (
                      <TableRow
                        key={file.id}
                        onClick={previewable ? () => handlePreview(file) : undefined}
                        className={previewable ? 'cursor-pointer' : 'cursor-default'}
                      >
                        <TableCell className="min-w-0 px-3 py-1.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <FileThumb type={file.filename} size="sm" />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-[13px] font-medium text-foreground">
                                {file.filename}
                              </span>
                              {file.description && (
                                <span className="truncate text-[11.5px] leading-tight text-muted-foreground">
                                  {file.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-1.5 font-mono text-[11px] uppercase text-muted-foreground">
                          {ext}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                          {formatFileSize(file.size_bytes)}
                        </TableCell>
                        <TableCell className="px-3 py-1.5">
                          <Pill tone="outline">{sourceLabel}</Pill>
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                          {formatDate(file.created_at)}
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
                              {previewable && (
                                <DropdownMenuItem onClick={() => handlePreview(file)}>
                                  <Eye className="mr-2 h-3.5 w-3.5" />
                                  预览
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDownload(file)}>
                                <Download className="mr-2 h-3.5 w-3.5" />
                                下载
                              </DropdownMenuItem>
                              {file.file_type === 'assets' && (
                                <DropdownMenuItem onClick={() => copyAssetUrl(file)}>
                                  <Link2 className="mr-2 h-3.5 w-3.5" />
                                  复制链接
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(file.id, file.filename)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
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
