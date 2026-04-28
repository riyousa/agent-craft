import React, { useState, useEffect, useMemo, useRef } from 'react';
import { chatApi, UserInfo, StreamEvent } from '../api/client';
import ReactMarkdown from 'react-markdown';
import { ChartBlock } from './charts/ChartBlock';
import remarkGfm from 'remark-gfm';
import { ConversationHistory } from './ConversationHistory';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  Brain,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Bot,
  MessageSquare,
  ArrowUpIcon,
  Paperclip,
  X,
  FileIcon,
  Image as ImageIcon,
  History,
  RotateCcw,
  StopCircle,
  SquarePen,
  FolderOpen,
  Search,
  Inbox,
  Upload,
  Files as FilesIcon,
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import { userApi, userModelsApi, UserVisibleModel, UserFile } from '../api/user';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription,
  DrawerFooter, DrawerHeader, DrawerTitle,
} from './ui/drawer';
import { useToast } from '../hooks/use-toast';
import { cn } from '../lib/utils';
import { Components } from 'react-markdown';

const toMarkdownString = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v
      .map((p: any) => (typeof p === 'string' ? p : p?.text ?? ''))
      .filter(Boolean)
      .join(' ');
  }
  try { return String(v); } catch { return ''; }
};

interface ChatInterfaceProps {
  userInfo: UserInfo;
  /** Pre-load this thread on mount — used when navigating from the
      history page. When unset, a fresh thread id is generated. */
  initialThreadId?: string;
}

interface Step {
  type: 'tool_call' | 'tool_result' | 'thinking';
  name?: string;
  args?: Record<string, any>;
  content?: string;
  timestamp: string;
}

interface AttachedFile {
  name: string;
  url: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  steps?: Step[];
  files?: AttachedFile[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ userInfo, initialThreadId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState(
    initialThreadId || `user_${userInfo.user_id}_${Date.now()}`,
  );
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approvalDetails, setApprovalDetails] = useState<any[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<Step[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  // In-flight "思考过程" panel (while LLM is still streaming). Expanded by
  // default so users can watch progress; clicking the header collapses it.
  const [liveStepsExpanded, setLiveStepsExpanded] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [enableReasoning, setEnableReasoning] = useState(() => {
    const saved = localStorage.getItem('enableReasoning');
    return saved === 'true';
  });
  const [availableModels, setAvailableModels] = useState<UserVisibleModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('chat:selectedModel') || ''
  );
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  // Picker dialog: lets the user attach a file already in their workspace
  // ("文件管理") instead of re-uploading. State stays local — no need to
  // hoist since nothing else listens to it.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFiles, setPickerFiles] = useState<UserFile[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFolder, setPickerFolder] = useState<string>(''); // '' = all folders
  // Combined attach button now opens a popover with two choices instead of
  // owning two separate icons in the composer.
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string>('');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentSteps]);

  const isImageUrl = (url: string): boolean => {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
  };

  const isVideoUrl = (url: string): boolean => {
    return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
  };

  const isBase64Image = (str: string): boolean => {
    return /^data:image\/(png|jpg|jpeg|gif|webp|bmp|svg\+xml);base64,/.test(str);
  };

  const resolveApiUrl = (url: string): string => {
    if (url.startsWith('/api/')) {
      return `${API_BASE}${url.substring(4)}`;
    }
    if (url.startsWith('/assets/')) {
      return `${API_BASE}${url}`;
    }
    return url;
  };

  const markdownComponents: Components = {
    ol: ({ node, ...props }) => (
      <ol className="list-decimal pl-6 my-2 space-y-1" {...props} />
    ),
    ul: ({ node, ...props }) => (
      <ul className="list-disc pl-6 my-2 space-y-1" {...props} />
    ),
    li: ({ node, ...props }) => (
      <li className="leading-relaxed" {...props} />
    ),
    img: ({ node, ...props }) => {
      const src = resolveApiUrl(props.src || '');
      return (
        <img
          {...props}
          src={src}
          className="max-w-full h-auto rounded-lg my-2"
          style={{ maxHeight: '500px', objectFit: 'contain' }}
          alt={props.alt || 'Content'}
        />
      );
    },
    a: ({ node, children, href: rawHref, ...props }) => {
      const href = resolveApiUrl(rawHref || '');
      if (href && isImageUrl(href)) {
        return (
          <div className="my-2">
            <img
              src={href}
              className="max-w-full h-auto rounded-lg"
              style={{ maxHeight: '500px', objectFit: 'contain' }}
              alt="Media content"
            />
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block mt-1">
              {children || '查看原图'}
            </a>
          </div>
        );
      }
      if (href && isVideoUrl(href)) {
        return (
          <div className="my-2">
            <video
              src={href}
              controls
              className="max-w-full h-auto rounded-lg"
              style={{ maxHeight: '500px' }}
            >
              您的浏览器不支持视频播放
            </video>
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block mt-1">
              {children || '下载视频'}
            </a>
          </div>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props} className="text-primary hover:underline">
          {children}
        </a>
      );
    },
    table: ({ node, ...props }) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => (
      <thead className="bg-muted/50" {...props} />
    ),
    th: ({ node, ...props }) => (
      <th className="px-3 py-2 text-left font-medium border-b border-border" {...props} />
    ),
    td: ({ node, ...props }) => (
      <td className="px-3 py-2 border-b border-border/50" {...props} />
    ),
    code: ({ node, className, children, ...props }: any) => {
      const content = String(children);
      const inline = !className && !content.includes('\n');
      // ```chart``` fence — render interactive chart via Recharts.
      if (className === 'language-chart') {
        return <ChartBlock raw={content} />;
      }
      if (!inline && isBase64Image(content.trim())) {
        return (
          <img
            src={content.trim()}
            className="max-w-full h-auto rounded-lg my-2"
            style={{ maxHeight: '500px', objectFit: 'contain' }}
            alt="Generated Content"
          />
        );
      }
      // Inline code: allow breaking inside long unbreakable tokens (e.g.
      // a JSON-ish string with no whitespace) so it can't punch through the
      // message container.
      const codeClass = inline
        ? `${className || ''} break-all whitespace-pre-wrap`.trim()
        : className;
      return (
        <code className={codeClass} {...props}>
          {children}
        </code>
      );
    },
    // Fenced code blocks render via <pre>; wrap long lines instead of
    // showing a horizontal scrollbar so the content never escapes the bubble.
    pre: ({ node, ...props }: any) => (
      <pre
        {...props}
        className={`${props.className || ''} max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]`.trim()}
      />
    ),
    p: ({ node, ...props }) => (
      <p className="break-words [overflow-wrap:anywhere]" {...props} />
    ),
  };

  useEffect(() => {
    localStorage.setItem('enableReasoning', enableReasoning.toString());
  }, [enableReasoning]);

  useEffect(() => {
    let cancelled = false;
    userModelsApi.list().then((list) => {
      if (cancelled) return;
      setAvailableModels(list);
      // If saved selection is no longer available, fall back to default.
      const stillExists = list.some((m) => m.name === selectedModel);
      if (!stillExists) {
        const def = list.find((m) => m.is_default) || list[0];
        const next = def?.name || '';
        setSelectedModel(next);
        if (next) localStorage.setItem('chat:selectedModel', next);
      }
    }).catch(() => {
      // Non-fatal: chat still tries (backend will fall back to default).
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedModel) localStorage.setItem('chat:selectedModel', selectedModel);
  }, [selectedModel]);

  const currentModelSupportsReasoning = useMemo(() => {
    const m = availableModels.find((x) => x.name === selectedModel);
    return m ? m.supports_reasoning : false;
  }, [availableModels, selectedModel]);

  // Default to TRUE for the empty state / unknown model (e.g. before the
  // model list has loaded) so first-paint doesn't briefly hide an
  // already-attached file. Once we know the model and it doesn't support
  // uploads, the composer button disappears.
  const currentModelSupportsFileUpload = useMemo(() => {
    const m = availableModels.find((x) => x.name === selectedModel);
    if (!m) return true;
    return !!m.supports_file_upload;
  }, [availableModels, selectedModel]);

  // Auto-grow the composer textarea between min-height and a hard cap.
  // Re-runs on every keystroke; clamps with `Math.min` so the pill can't
  // push the chat area off-screen, and lets the textarea scroll once full.
  const TEXTAREA_MAX_HEIGHT = 200;
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT);
    ta.style.height = `${next}px`;
  }, [input]);

  // When a thread id is handed in (e.g. from the history page), load
  // that thread's messages once on mount so the user lands inside the
  // conversation rather than a blank chat with the wrong thread.
  useEffect(() => {
    if (!initialThreadId) return;
    handleSelectConversation(initialThreadId);
    // Intentionally one-shot — switching threads later happens via the
    // composer drawer, not by remounting with a new prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectConversation = async (newThreadId: string) => {
    setThreadId(newThreadId);
    setMessages([]);
    setCurrentSteps([]);
    setRequiresApproval(false);
    setApprovalDetails([]);

    try {
      const history = await chatApi.getConversationMessages(newThreadId);
      if (history.messages && history.messages.length > 0) {
        const loadedMessages: Message[] = history.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
          steps: msg.steps as Step[] | undefined,
        }));
        setMessages(loadedMessages);
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    }
  };

  const handleNewConversation = () => {
    const newThreadId = `user_${userInfo.user_id}_${Date.now()}`;
    // If we had an in-flight stream, abort it so a stale response can't
    // land on the new thread.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setThreadId(newThreadId);
    setMessages([]);
    setCurrentSteps([]);
    setRequiresApproval(false);
    setApprovalDetails([]);
    setInput('');
    setLoading(false);
    setApprovalLoading(false);
  };

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await userApi.uploadFile(file, 'assets', '对话素材');
      // Prefer the server-signed URL; fall back to the unsigned path (will 403 now,
      // but at least surfaces the error to the user).
      const url = result.asset_url ? `${API_BASE}${result.asset_url}` : `${API_BASE}/assets/${result.id}`;
      setAttachedFiles(prev => [...prev, { name: file.name, url }]);
    } catch {
      // toast would be nice but ChatInterface doesn't import useToast currently
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const openFilePicker = async () => {
    setAttachMenuOpen(false);
    setPickerOpen(true);
    setPickerSearch('');
    setPickerFolder('');
    setPickerLoading(true);
    try {
      // Load every folder in one shot — file_type filtering happens
      // client-side so switching tabs is instant and the dialog only
      // costs a single network round-trip when first opened.
      const files = await userApi.listFiles();
      setPickerFiles(files);
    } catch {
      setPickerFiles([]);
    } finally {
      setPickerLoading(false);
    }
  };

  // Folder definitions mirror the tabs in UserFilesManager so the chat
  // picker reads the same vocabulary the user already learned there.
  const PICKER_FOLDERS: { id: string; label: string; Icon: typeof FolderOpen }[] = [
    { id: '', label: '全部', Icon: FolderOpen },
    { id: 'files', label: '上传', Icon: FilesIcon },
    { id: 'generated', label: '生成', Icon: Sparkles },
    { id: 'sandbox', label: '沙箱', Icon: FlaskConical },
    { id: 'assets', label: '素材', Icon: Paperclip },
  ];

  const attachFromWorkspace = (file: UserFile) => {
    // Prefer the server-signed asset_url (with token), fall back to the
    // unsigned route — same logic as upload, see handleFileUpload.
    const url = file.asset_url
      ? `${API_BASE}${file.asset_url}`
      : `${API_BASE}/assets/${file.id}`;
    // Skip duplicates (same URL already attached).
    setAttachedFiles(prev =>
      prev.some(f => f.url === url) ? prev : [...prev, { name: file.filename, url }],
    );
    setPickerOpen(false);
  };

  // Filter chain: folder tab → search query → sort newest-first. All
  // computed locally so flipping tabs / typing in the search box is
  // instant after the initial fetch.
  const filteredPickerFiles = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const byFolder = pickerFolder
      ? pickerFiles.filter(f => f.file_type === pickerFolder)
      : pickerFiles;
    const list = q
      ? byFolder.filter(
          f =>
            f.filename.toLowerCase().includes(q) ||
            (f.description || '').toLowerCase().includes(q),
        )
      : byFolder;
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [pickerFiles, pickerSearch, pickerFolder]);

  // Per-folder counts for tab badges — derived from the current filtered
  // search query so the badge "decreases" as the user narrows results.
  const folderCounts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const matches = q
      ? pickerFiles.filter(
          f =>
            f.filename.toLowerCase().includes(q) ||
            (f.description || '').toLowerCase().includes(q),
        )
      : pickerFiles;
    const counts: Record<string, number> = { '': matches.length };
    for (const f of matches) {
      counts[f.file_type] = (counts[f.file_type] || 0) + 1;
    }
    return counts;
  }, [pickerFiles, pickerSearch]);

  const formatBytes = (n: number): string => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const sendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || loading) return;

    const fileUrls = attachedFiles.map(f => f.url);

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    const messageText = input;
    setInput('');
    setAttachedFiles([]);
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setCurrentSteps([]);
    setRequiresApproval(false);
    setApprovalDetails([]);
    setApprovalLoading(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let localSteps: Step[] = [];
    // Track whether we've already released the loading lock. The stream's
    // onComplete/onError callbacks should always release it, but as a
    // defence against dropped events or unexpected exceptions we also
    // release in finally below — guarantees the UI never stays frozen.
    let loadingReleased = false;
    const releaseLoading = () => {
      if (!loadingReleased) {
        loadingReleased = true;
        setLoading(false);
      }
    };

    try {
      await chatApi.streamMessage(
        {
          thread_id: threadId,
          message: messageText,
          user_info: {
            ...userInfo,
            enable_reasoning: enableReasoning,
          },
          file_urls: fileUrls,
          checkpoint_id: forkCheckpointId || undefined,
          model_id: selectedModel || undefined,
        },
        (event: StreamEvent) => {
          const timestamp = new Date().toISOString();

          switch (event.type) {
            case 'thinking':
              if (event.content) {
                const thinkingStep: Step = {
                  type: 'thinking',
                  content: event.content,
                  timestamp,
                };
                localSteps.push(thinkingStep);
                setCurrentSteps((prev) => [...prev, thinkingStep]);
              }
              break;

            case 'tool_calls':
              event.tool_calls?.forEach((tc) => {
                const step: Step = {
                  type: 'tool_call',
                  name: tc.name,
                  args: tc.args,
                  timestamp,
                };
                localSteps.push(step);
                setCurrentSteps((prev) => [...prev, step]);
              });
              break;

            case 'tool_result':
              const toolResultStep: Step = {
                type: 'tool_result',
                name: event.name || 'unknown_tool',
                content: event.content,
                timestamp,
              };
              localSteps.push(toolResultStep);
              setCurrentSteps((prev) => [...prev, toolResultStep]);
              break;

            case 'ai_message':
              break;

            case 'final':
              const assistantMessage: Message = {
                role: 'assistant',
                content: event.content || '',
                timestamp,
                steps: localSteps.length > 0 ? [...localSteps] : undefined,
              };

              setMessages((prev) => [...prev, assistantMessage]);
              setRequiresApproval(event.requires_approval || false);

              if (event.approval_details && event.approval_details.length > 0) {
                setApprovalDetails(event.approval_details);
              } else {
                setApprovalDetails([]);
              }

              setCurrentSteps([]);
              localSteps = [];
              break;

            case 'error':
              const errorMessage: Message = {
                role: 'system',
                content: `错误: ${event.error}`,
                timestamp,
              };
              setMessages((prev) => [...prev, errorMessage]);
              setCurrentSteps([]);
              localSteps = [];
              break;
          }
        },
        () => {
          abortControllerRef.current = null;
          setForkCheckpointId('');  // Clear fork point after first use
          releaseLoading();
          setHistoryRefreshTrigger(prev => prev + 1);
        },
        (error: string) => {
          abortControllerRef.current = null;
          const errorMessage: Message = {
            role: 'system',
            content: `错误: ${error}`,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errorMessage]);
          setCurrentSteps([]);
          releaseLoading();
        },
        controller.signal,
      );
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'system',
        content: `错误: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      // Belt-and-suspenders: guarantee the input lock is released no matter
      // which path exited the stream. If neither onComplete nor onError fired
      // (shouldn't happen, but has been observed after network hiccups) this
      // still unblocks the next turn.
      releaseLoading();
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setMessages(prev => [...prev, {
        role: 'system' as const,
        content: '已取消生成',
        timestamp: new Date().toISOString(),
      }]);
    }
  };

  // === Version History (Rollback) ===
  const loadCheckpoints = async () => {
    setVersionsLoading(true);
    try {
      const res = await chatApi.getThreadHistory(threadId, 30);
      setCheckpoints(res.checkpoints || []);
    } catch {
      setCheckpoints([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const openVersions = () => {
    setShowVersions(true);
    loadCheckpoints();
  };

  const handleRollback = async (checkpointId: string) => {
    setRollingBack(true);
    try {
      // Load state at that checkpoint
      const state = await chatApi.getThreadState(threadId, checkpointId);
      const restored: Message[] = [];
      for (const msg of state.messages || []) {
        if (msg.type === 'HumanMessage') {
          const content = typeof msg.content === 'string' ? msg.content
            : Array.isArray(msg.content) ? msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ') || '[附件]'
            : '[消息]';
          restored.push({ role: 'user', content, timestamp: '' });
        } else if (msg.type === 'AIMessage' && msg.content) {
          const content = typeof msg.content === 'string' ? msg.content
            : Array.isArray(msg.content) ? msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ')
            : '';
          if (content) restored.push({ role: 'assistant', content, timestamp: '' });
        }
      }
      setMessages(restored);
      setCurrentSteps([]);
      setRequiresApproval(false);
      setForkCheckpointId(checkpointId);  // Next message will fork from here
      setShowVersions(false);
      toast({ title: '已回溯', description: `恢复到 ${restored.length} 条消息，发送新消息将从此处继续` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: '回溯失败', description: err.message });
    } finally {
      setRollingBack(false);
    }
  };

  const handleApprove = async () => {
    if (approvalLoading) return;

    setApprovalLoading(true);

    try {
      const response = await chatApi.approve(threadId);
      setRequiresApproval(false);

      const approvalMessage: Message = {
        role: 'system',
        content: '✓ 操作已批准',
        timestamp: new Date().toISOString(),
      };

      const newMessages: Message[] = [approvalMessage];
      const approvalSteps: Step[] = [];

      if (response.data?.new_messages) {
        response.data.new_messages.forEach((msg: any) => {
          if (msg.type === 'ToolMessage') {
            approvalSteps.push({
              type: 'tool_result',
              name: msg.name || 'unknown_tool',
              content: msg.content || '',
              timestamp: new Date().toISOString(),
            });
          }
        });

        const aiMessages = response.data.new_messages.filter((msg: any) => msg.type === 'AIMessage' && msg.content);
        if (aiMessages.length > 0) {
          const combinedContent = aiMessages.map((msg: any) => msg.content).join('\n');
          newMessages.push({
            role: 'assistant',
            content: combinedContent,
            timestamp: new Date().toISOString(),
            steps: approvalSteps.length > 0 ? approvalSteps : undefined,
          });
        } else if (approvalSteps.length > 0) {
          newMessages.push({
            role: 'assistant',
            content: '操作已完成',
            timestamp: new Date().toISOString(),
            steps: approvalSteps,
          });
        }
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'system',
        content: `批准失败: ${error.message || '未知错误'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleReject = async () => {
    if (approvalLoading) return;

    setApprovalLoading(true);

    try {
      await chatApi.reject(threadId);
      setRequiresApproval(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: '✗ 操作已拒绝',
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'system',
        content: `拒绝失败: ${error.message || '未知错误'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setApprovalLoading(false);
    }
  };

  const toggleSteps = (index: number) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Inline node on the activity timeline rail. Renders one circle node + body
  // for a single step. The vertical rail itself is drawn as an absolute line in
  // the parent — see renderThinkingPanel.
  const renderTimelineStep = (step: Step, stepIndex: number, isLast: boolean) => {
    const node = (() => {
      switch (step.type) {
        case 'thinking':
          return <Brain className="w-3 h-3 text-muted-foreground" />;
        case 'tool_call':
          return <Wrench className="w-3 h-3 text-primary" />;
        case 'tool_result':
          return <CheckCircle2 className="w-3 h-3 text-chart-2" />;
        default:
          return null;
      }
    })();

    return (
      <div
        key={stepIndex}
        className="relative pl-8 pb-3 last:pb-0 min-w-0 animate-fade-in-up"
      >
        {/* vertical rail to next node */}
        {!isLast && (
          <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
        )}
        {/* node */}
        <div className="absolute left-0 top-0.5 h-6 w-6 rounded-full bg-muted ring-4 ring-background flex items-center justify-center">
          {node}
        </div>

        {step.type === 'thinking' && (
          <div className="text-xs text-muted-foreground prose prose-xs dark:prose-invert max-w-none leading-relaxed pt-0.5 min-w-0 break-words [overflow-wrap:anywhere]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {toMarkdownString(step.content)}
            </ReactMarkdown>
          </div>
        )}

        {step.type === 'tool_call' && (
          <div className="space-y-1.5 pt-0.5">
            <div className="text-xs font-medium">
              调用 <code className="font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">{step.name}</code>
            </div>
            {step.args && Object.keys(step.args).length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">INPUT</div>
                <pre className="text-[11px] font-mono bg-background/60 border border-border/40 rounded-md p-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
                  {JSON.stringify(step.args, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {step.type === 'tool_result' && (
          <div className="space-y-1.5 pt-0.5">
            <div className="text-xs font-medium flex items-center gap-2 flex-wrap">
              <code className="font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">{step.name}</code>
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-chart-2/10 text-chart-2 border border-chart-2/20">
                <CheckCircle2 className="w-3 h-3" /> Success
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">OUTPUT</div>
              <div className="text-[11px] font-mono bg-background/60 border border-border/40 rounded-md p-2 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-48 max-w-full">
                {toMarkdownString(step.content)}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Collapsible card containing the activity timeline (above an AI message).
  const renderThinkingPanel = (
    steps: Step[],
    expanded: boolean,
    onToggle: () => void,
    isInFlight: boolean = false,
  ) => {
    return (
      <div className="border border-border/40 bg-muted/30 rounded-lg mb-3 overflow-hidden animate-fade-in">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
        >
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">思考过程</span>
          <span className="text-xs text-muted-foreground">
            {steps.length} 步{isInFlight ? ' · 进行中' : ''}
          </span>
          {isInFlight && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
          <span className="ml-auto text-muted-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </button>
        {expanded && (
          <div className="px-3 pt-3 pb-3 border-t border-border/40">
            {steps.map((step, i) => renderTimelineStep(step, i, i === steps.length - 1))}
          </div>
        )}
      </div>
    );
  };

  // Composer (input pill + picker tabs). Shared by the welcome screen and the
  // sticky bottom slot of the chat view.
  const renderComposer = () => {
    const hasMessages = messages.length > 0;
    // Subtle ghost chip used in the top context bar + bottom thread tabs.
    // Visually low-key — should never compete with the input pill itself.
    const chipBase =
      "h-8 px-2.5 rounded-md gap-1.5 text-xs font-normal transition-colors " +
      "border-0 shadow-none";
    const chipGhost =
      chipBase + " bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground";

    return (
      <div className="space-y-2">
        {/* ─── Top context bar: model + reasoning + (new chat) ─── */}
        <div className="flex items-center gap-1 px-1 min-h-[2rem]">
          {availableModels.length > 0 && (
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={loading}>
              <SelectTrigger
                className={cn(
                  chipGhost,
                  "w-auto justify-start",
                  "focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                  "data-[placeholder]:text-muted-foreground/60",
                  "[&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:text-foreground [&>span]:line-clamp-1",
                  "[&>svg]:opacity-50 [&>svg]:shrink-0"
                )}
              >
                <Bot className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent align="start">
                {availableModels.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      {m.display_name}
                      {m.is_default && (
                        <span className="text-muted-foreground">· 默认</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {currentModelSupportsReasoning && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEnableReasoning(!enableReasoning)}
              className={cn(
                chipBase,
                enableReasoning
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
              title="深度思考"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>深度思考</span>
              {enableReasoning && <CheckCircle2 className="w-3 h-3 ml-0.5" />}
            </Button>
          )}

          <div className="flex-1" />

          {hasMessages && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className={chipGhost}
              title="开始新对话"
            >
              <SquarePen className="w-3.5 h-3.5" />
              <span>新对话</span>
            </Button>
          )}
        </div>

        {/* ─── Composer pill ─── */}
        <div
          className={cn(
            "bg-muted/60 rounded-3xl rounded-bl-sm px-3 pt-2.5 pb-2",
            "border border-border/40 shadow-sm",
            "transition-shadow focus-within:shadow-md focus-within:border-border/60"
          )}
        >
          {attachedFiles.length > 0 && (
            <div className="flex gap-2 pb-2 px-1 flex-wrap">
              {attachedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-background/70 border border-border/40 rounded-md px-2.5 py-1 text-xs"
                >
                  <FileIcon className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate max-w-[150px]">{f.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="hover:text-chart-5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />

          <div className="flex items-end gap-1.5">
            {currentModelSupportsFileUpload && (
            <Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={loading || uploading}
                  className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/60 shrink-0"
                  title="添加附件"
                >
                  {uploading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Paperclip className="w-4 h-4" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-56 p-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                >
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">上传本地文件</div>
                    <div className="text-xs text-muted-foreground">从电脑选择新文件</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">从文件管理选择</div>
                    <div className="text-xs text-muted-foreground">已上传/生成/沙箱/素材</div>
                  </div>
                </button>
              </PopoverContent>
            </Popover>
            )}

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasMessages ? '继续对话...' : '问点什么...'}
              disabled={loading}
              rows={1}
              className={cn(
                "flex-1 resize-none px-1 py-1.5 bg-transparent shadow-none",
                "border-0 outline-none overflow-y-auto",
                "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                "min-h-[36px] text-sm leading-6",
                "placeholder:text-muted-foreground/60"
              )}
            />

            {loading ? (
              <Button
                onClick={handleCancel}
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full bg-chart-5/10 hover:bg-chart-5/20 text-chart-5 hover:text-chart-5 shrink-0"
                title="停止生成"
              >
                <StopCircle className="w-[18px] h-[18px]" />
              </Button>
            ) : (
              <Button
                onClick={sendMessage}
                disabled={!input.trim() && attachedFiles.length === 0}
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-full shrink-0 shadow-none",
                  "disabled:bg-muted-foreground/15 disabled:text-muted-foreground/50"
                )}
                title="发送 (Enter)"
              >
                <ArrowUpIcon className="w-[18px] h-[18px]" />
              </Button>
            )}
          </div>
        </div>

        {/* ─── Bottom thread bar: always visible so users can browse past
             conversations even from the welcome screen. Version rollback only
             makes sense after a chat exists, so it stays gated. ─── */}
        <div className="flex items-center gap-1 px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(true)}
            className={chipGhost}
            title="历史会话"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>历史会话</span>
          </Button>
          {hasMessages && (
            <Button
              variant="ghost"
              size="sm"
              onClick={openVersions}
              disabled={loading}
              className={chipGhost}
              title="版本回滚"
            >
              <History className="w-3.5 h-3.5" />
              <span>版本回滚</span>
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full relative bg-background">

      {/* Welcome (empty state) — composer is centered inline */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-8">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-6 space-y-1.5">
              <h1
                className="text-2xl md:text-3xl font-semibold tracking-tight animate-rise-in"
                style={{ animationDelay: '40ms' }}
              >
                欢迎回来
              </h1>
              <p
                className="text-sm text-muted-foreground animate-rise-in"
                style={{ animationDelay: '160ms' }}
              >
                内部 API、流程、数据，一句话搞定
              </p>
            </div>
            <div className="animate-rise-in" style={{ animationDelay: '280ms' }}>
              {renderComposer()}
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* Messages Container */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-5 pt-6 pb-2">
          {/* Messages */}
          {messages.map((msg, index) => (
            <div
              key={index}
              className="flex flex-col group min-w-0 animate-fade-in-up"
              // Tiny per-message stagger so a freshly-loaded thread cascades
              // in instead of slamming on screen all at once. Capped at 150ms
              // so long histories don't feel sluggish on first paint, and
              // each newly-streamed message (highest index, mounted alone)
              // keeps a snappy ~280ms entry.
              style={{ animationDelay: `${Math.min(index * 25, 150)}ms` }}
            >
              {msg.role === 'user' ? (
                /* User — right-aligned bubble, no avatar, asymmetric corner */
                <div className="flex justify-end">
                  <div className="bg-muted text-foreground rounded-3xl rounded-br-lg max-w-[85%] sm:max-w-[80%] px-4 py-3 break-words [overflow-wrap:anywhere] min-w-0">
                    {msg.content && (
                      <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 break-words [overflow-wrap:anywhere]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{toMarkdownString(msg.content)}</ReactMarkdown>
                      </div>
                    )}
                    {msg.files && msg.files.length > 0 && (
                      <div className={cn("flex flex-wrap gap-2", msg.content && "mt-2")}>
                        {msg.files.map((f, fi) => {
                          const ext = f.name.split('.').pop()?.toLowerCase() || '';
                          const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
                          return (
                            <a
                              key={fi}
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border/50 bg-background/40 hover:bg-background/60 transition-colors"
                            >
                              {isImage
                                ? <ImageIcon className="w-3.5 h-3.5 text-chart-4" />
                                : <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                              <span className="truncate max-w-[150px]">{f.name}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : msg.role === 'assistant' ? (
                /* Assistant — no avatar, no bubble, plain markdown on bg */
                <div className="w-full min-w-0">
                  {msg.steps && msg.steps.length > 0 && renderThinkingPanel(
                    msg.steps,
                    expandedSteps.has(index),
                    () => toggleSteps(index),
                  )}
                  {msg.content && (
                    <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 break-words [overflow-wrap:anywhere]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{toMarkdownString(msg.content)}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ) : (
                /* System — subtle inline notice */
                <div className="text-xs text-muted-foreground italic px-2">
                  {msg.content}
                </div>
              )}

              {msg.timestamp && (
                <div className={cn(
                  "text-[10px] text-muted-foreground/50 mt-1.5",
                  msg.role === 'user' ? 'text-right' : 'text-left'
                )}>
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))}

          {/* Loading — either show in-flight thinking timeline, or 3-dot bouncer */}
          {loading && (
            <div className="w-full">
              {currentSteps.length > 0 ? (
                renderThinkingPanel(
                  currentSteps,
                  liveStepsExpanded,
                  () => setLiveStepsExpanded((v) => !v),
                  true,
                )
              ) : (
                <div className="flex gap-1.5 items-center px-1 py-2">
                  <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.32s]" />
                  <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.16s]" />
                  <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" />
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
        </>
      )}

      {/* Approval Bar */}
      {requiresApproval && (
        <div className="flex-shrink-0 px-4 py-3 border-t bg-background animate-slide-down-fade">
          <div className="max-w-3xl mx-auto">
            <Alert variant="destructive" className="border-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">需要您的审批</AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p className="text-xs">AI助手请求执行以下敏感操作：</p>

                {approvalDetails && approvalDetails.length > 0 && (
                  <div className="space-y-2">
                    {approvalDetails.map((tool, index) => (
                      <div key={index} className="p-2 rounded-lg bg-background/50 border text-xs">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="font-medium">{tool.display_name || tool.name}</span>
                        </div>
                        {tool.args && Object.keys(tool.args).length > 0 && (
                          <pre className="mt-1.5 p-2 rounded bg-muted text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
                            {JSON.stringify(tool.args, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={handleReject}
                    variant="outline"
                    size="sm"
                    disabled={approvalLoading}
                    className="flex-1"
                  >
                    <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
                    拒绝
                  </Button>
                  <Button
                    onClick={handleApprove}
                    size="sm"
                    disabled={approvalLoading}
                    className="flex-1 bg-chart-2 text-white hover:opacity-90"
                  >
                    {approvalLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        处理中
                      </>
                    ) : (
                      <>
                        <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
                        批准
                      </>
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Sticky bottom Composer (only when chat is active — empty state has inline one) */}
      {messages.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-background">
          <div className="max-w-3xl mx-auto">
            {renderComposer()}
          </div>
        </div>
      )}

      {/* Version History Drawer */}
      <Drawer open={showVersions} onOpenChange={setShowVersions}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-lg">
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <History className="w-5 h-5" /> 对话版本历史
              </DrawerTitle>
              <DrawerDescription>
                选择一个历史版本回溯，之后的对话内容将被覆盖
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-4 max-h-96 overflow-y-auto">
              {versionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : checkpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">暂无历史版本</p>
              ) : (
                <div className="space-y-2">
                  {checkpoints.map((cp, i) => (
                    <div
                      key={cp.checkpoint_id || i}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{cp.message_count} 条消息</span>
                          {i === 0 && <span className="text-xs text-chart-1">(当前)</span>}
                          {cp.requires_approval && <span className="text-xs text-chart-4">等待审批</span>}
                        </div>
                        {cp.last_message_preview && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {cp.last_message_preview}
                          </p>
                        )}
                      </div>
                      {i > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRollback(cp.checkpoint_id)}
                          disabled={rollingBack}
                          className="shrink-0"
                        >
                          {rollingBack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                          回溯
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline">关闭</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      {/* History modal — opened from the bottom thread bar */}
      <ConversationHistory
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        currentThreadId={threadId}
        onSelectConversation={handleSelectConversation}
        refreshTrigger={historyRefreshTrigger}
      />

      {/* File picker — pulls existing items from 文件管理 so the user
          doesn't have to re-upload assets they've already saved. */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              从文件管理选择
            </DialogTitle>
            <DialogDescription>
              点击文件即可加入到本次对话；多次点击可附加多个。
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="搜索文件名或描述"
              className="pl-9"
            />
          </div>

          {/* Folder tabs — mirror UserFilesManager. Counts reflect the
              current search query so the user can see at a glance which
              folder still has matches. */}
          <div className="flex flex-wrap gap-1">
            {PICKER_FOLDERS.map(({ id, label, Icon }) => {
              const count = folderCounts[id] ?? 0;
              const active = pickerFolder === id;
              return (
                <Button
                  key={id || 'all'}
                  variant={active ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setPickerFolder(id)}
                  className="h-8 gap-1.5"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 rounded-full',
                      active
                        ? 'bg-background/20 text-primary-foreground/90'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>

          <ScrollArea className="max-h-[420px] rounded-md border border-border/50">
            {pickerLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : filteredPickerFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <Inbox className="w-6 h-6 opacity-60" />
                {pickerSearch ? '没有匹配的文件' : '文件管理还没有文件，先去上传一个吧'}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredPickerFiles.map((file) => {
                  const ext = file.filename.split('.').pop()?.toLowerCase() || '';
                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                  const folderMeta =
                    PICKER_FOLDERS.find((f) => f.id === file.file_type) || null;
                  const alreadyAttached = attachedFiles.some(
                    (f) =>
                      f.url ===
                      (file.asset_url
                        ? `${API_BASE}${file.asset_url}`
                        : `${API_BASE}/assets/${file.id}`),
                  );
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => attachFromWorkspace(file)}
                      disabled={alreadyAttached}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        alreadyAttached
                          ? 'opacity-60 cursor-not-allowed'
                          : 'hover:bg-accent',
                      )}
                    >
                      {isImage ? (
                        <ImageIcon className="w-4 h-4 text-chart-4 flex-shrink-0" />
                      ) : (
                        <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.filename}</div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                          {folderMeta && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/70 text-[10px]">
                              <folderMeta.Icon className="w-3 h-3" />
                              {folderMeta.label}
                            </span>
                          )}
                          <span>{formatBytes(file.size_bytes)}</span>
                          {file.description && <span>· {file.description}</span>}
                        </div>
                      </div>
                      {alreadyAttached && (
                        <CheckCircle2 className="w-4 h-4 text-chart-2 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatInterface;
