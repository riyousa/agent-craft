import React, { useState, useEffect } from 'react';
import { userApi, UserSkill, UserTool, SkillsApi, ToolsApi } from '../api/user';
import { chatApi } from '../api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import {
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  Lock,
  Unlock,
  Copy,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Lightbulb,
  Zap,
  Search,
  MoreHorizontal,
  CheckCircle2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';
import { PageHeader, PageTitle, Toolbar, Pill, EmptyState } from './design';
import { metricsFor as skillMetricsFor, formatRuns } from '../mock/skill_metrics';

type ViewMode = 'list' | 'create' | 'edit';

// Built-in tools that aren't stored in the user_tools table but are always
// bound to the LLM via `src/tools/registry.py`. Skill authors need to know
// the names so they can reference them inside prompt_template, e.g.
//   {{tool:get_current_time()}}
// or instruct the LLM to call them in plain language.
type BuiltinTool = {
  name: string;
  display_name: string;
  description: string;
  // Pre-built placeholder snippet copied to clipboard.
  placeholder: string;
};
const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    name: 'get_current_time',
    display_name: '获取当前时间',
    description: '返回服务端真实当前时间（默认 Asia/Shanghai，可选 IANA 时区）。涉及"今天/现在/星期几/N 天前后"等时间问题时调用，避免模型凭训练记忆乱猜日期。',
    placeholder: '{{tool:get_current_time()}}',
  },
  {
    name: 'render_chart',
    display_name: '渲染可视化图表',
    description: '把结构化数据渲染成柱状/折线/散点/饼/面积图（强校验，前端会自动出交互式图）。仅在用户明确要求"画图/可视化/趋势对比"等场景调用。',
    placeholder: '{{tool:render_chart(type="bar", title="...", xKey="字段", series=[{"dataKey":"字段","name":"显示名"}], data=[{"字段":"值"}])}}',
  },
];
const BUILTIN_TOOL_NAMES = BUILTIN_TOOLS.map((t) => t.name);

interface SkillsManagerProps {
  api?: SkillsApi;
  toolsApi?: ToolsApi;
  onBack?: () => void;
}

export const SkillsManager: React.FC<SkillsManagerProps> = ({ api, toolsApi, onBack }) => {
  const skillsApi: SkillsApi = api || userApi;
  const toolsApiForDeps: ToolsApi = toolsApi || userApi;
  const isAdminMode = !!api;
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [tools, setTools] = useState<UserTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'time-desc' | 'time-asc' | 'name'>('time-desc');
  // List-view filter state — purely client-side until the backend
  // exposes server-side filtering hooks (Phase 4).
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'user_created' | 'admin_assigned'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'approval'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSkill, setSelectedSkill] = useState<UserSkill | null>(null);

  // AI Helper state
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  // Form validation state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [invalidTools, setInvalidTools] = useState<string[]>([]);
  const [showAvailableTools, setShowAvailableTools] = useState(false);
  const [showBuiltinTools, setShowBuiltinTools] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formData, setFormData] = useState<Partial<UserSkill>>({
    name: '',
    display_name: '',
    description: '',
    category: 'analysis',
    calling_guide: '',
    input_schema: {},
    output_schema: {},
    prompt_template: '',
    required_tools: [],
    quality_criteria: [],
    examples: {},
    requires_approval: false,
  });

  useEffect(() => {
    loadSkills();
    loadTools();
  }, []);

  useEffect(() => {
    if (formData.prompt_template && viewMode !== 'list') {
      extractToolDependencies(formData.prompt_template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.prompt_template, viewMode]);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const data = await skillsApi.listSkills();
      setSkills(data);
    } catch (error) {
      toast({ variant: "destructive", title: "加载失败", description: "无法加载技能列表" });
    } finally {
      setLoading(false);
    }
  };

  const loadTools = async () => {
    try {
      const data = await toolsApiForDeps.listTools();
      setTools(data);
    } catch (error) {
      console.error('Failed to load tools:', error);
    }
  };

  const extractToolDependencies = (template: string) => {
    const pattern = /\{\{tool:([\w_]+)\(/g;
    const matches: string[] = [];
    let match;
    while ((match = pattern.exec(template)) !== null) {
      matches.push(match[1]);
    }
    const toolNames = Array.from(new Set(matches));
    const availableToolNames = tools.map(t => t.name).concat(BUILTIN_TOOL_NAMES);
    const invalid = toolNames.filter(name => !availableToolNames.includes(name));
    setInvalidTools(invalid);
    setFormData(prev => ({ ...prev, required_tools: toolNames }));
  };

  const validatePlaceholderSyntax = (template: string): string[] => {
    const errors: string[] = [];

    // 检测Jinja2控制流标签 {% for %}, {% if %} 等
    const jinjaTagPattern = /\{%\s*(\w+)/g;
    let jinjaMatch;
    while ((jinjaMatch = jinjaTagPattern.exec(template)) !== null) {
      errors.push(`不支持Jinja2控制流语法: '{%...%}'（发现 '${jinjaMatch[0]}...'）。本系统只支持 {{tool:...}}, {{input.xxx}}, {{result.xxx.yyy}} 三种占位符，列表数据由AI代理在运行时处理展示。`);
      break; // 只报一次
    }

    const openCount = (template.match(/\{\{/g) || []).length;
    const closeCount = (template.match(/\}\}/g) || []).length;

    if (openCount !== closeCount) {
      errors.push(`占位符括号不匹配: 有${openCount}个'{{', 但有${closeCount}个'}}'`);
    }

    const placeholderPattern = /\{\{([^}]+)\}\}/g;
    const placeholders: RegExpExecArray[] = [];
    let m;
    while ((m = placeholderPattern.exec(template)) !== null) {
      placeholders.push(m);
    }

    for (const ph of placeholders) {
      const placeholder = ph[1].trim();
      if (placeholder.startsWith('tool:')) {
        if (!placeholder.includes('(')) {
          errors.push(`Tool占位符格式错误: '{{${placeholder}}}' 缺少参数括号`);
        }
      } else if (placeholder.startsWith('input.')) {
        const paramName = placeholder.substring(6);
        if (!/^[\w_]+$/.test(paramName)) {
          errors.push(`输入参数名称格式错误: '{{${placeholder}}}'`);
        }
      } else if (placeholder.startsWith('result.')) {
        const parts = placeholder.split('.');
        if (parts.length < 2 || !parts[1]) {
          errors.push(`结果引用格式错误: '{{${placeholder}}}', 应为 result.tool_name 或 result.tool_name.field_name`);
        }
      } else {
        // 检测常见的Jinja2语法误用
        const jinjaKeywords = ['loop.index', 'loop.index0', 'loop.length', 'item.', 'forloop.'];
        const isJinja = jinjaKeywords.some(kw => placeholder.startsWith(kw) || placeholder.includes(kw));
        if (isJinja) {
          errors.push(`不支持Jinja2语法: '{{${placeholder}}}'，只支持 {{tool:...}}, {{input.xxx}}, {{result.xxx.yyy}} 三种占位符。列表数据请直接引用 {{result.tool_name}} 由AI代理在运行时处理展示。`);
        } else {
          errors.push(`未知的占位符类型: '{{${placeholder}}}'，只支持 {{tool:...}}, {{input.xxx}}, {{result.xxx.yyy}} 三种占位符`);
        }
      }
    }
    return errors;
  };

  const handleAIGenerate = async () => {
    if (!aiDescription.trim()) {
      toast({ variant: "destructive", title: "请输入需求描述" });
      return;
    }
    setAiGenerating(true);
    setAiError('');
    try {
      const availableTools = tools.filter(t => t.enabled !== false).map(t => ({
        name: t.name,
        display_name: t.display_name,
        description: t.description,
        requires_approval: t.requires_approval || false,
        input_schema: t.input_schema || {},
        output_schema: t.output_schema || {},
      }));
      const result = await chatApi.parseSkillConfig(aiDescription, availableTools);
      if (viewMode === 'edit' && selectedSkill) {
        const { name, ...restConfig } = result.skill_config;
        setFormData({ ...formData, ...restConfig, name: selectedSkill.name });
      } else {
        setFormData({ ...formData, ...result.skill_config });
      }
      setAiError('');
    } catch (error: any) {
      setAiError(error.message || 'AI生成失败');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleCreate = () => {
    setSelectedSkill(null);
    setAiDescription('');
    setAiError('');
    setValidationErrors([]);
    setInvalidTools([]);
    setFormData({
      name: '', display_name: '', description: '', category: 'analysis',
      calling_guide: '', input_schema: {}, output_schema: {},
      prompt_template: '', required_tools: [], quality_criteria: [],
      examples: {}, requires_approval: false,
    });
    setViewMode('create');
  };

  const handleEdit = (skill: UserSkill) => {
    setSelectedSkill(skill);
    setAiDescription('');
    setAiError('');
    setValidationErrors([]);
    setInvalidTools([]);
    setFormData(skill);
    setViewMode('edit');
  };

  const handleSave = async () => {
    const syntaxErrors = validatePlaceholderSyntax(formData.prompt_template || '');
    if (syntaxErrors.length > 0 || invalidTools.length > 0) {
      setValidationErrors([...syntaxErrors]);
      return;
    }
    try {
      if (viewMode === 'create') {
        await skillsApi.createSkill(formData as UserSkill);
        toast({ variant: "success", title: "创建成功", description: "技能已成功创建" });
      } else if (selectedSkill && selectedSkill.skill_id) {
        await skillsApi.updateSkill(selectedSkill.skill_id, formData);
        toast({ variant: "success", title: "更新成功", description: "技能已成功更新" });
      }
      setViewMode('list');
      setSelectedSkill(null);
      loadSkills();
    } catch (error) {
      toast({ variant: "destructive", title: "保存失败", description: "无法保存技能，请检查输入并重试" });
    }
  };

  const handleToggleEnabled = async (skill: UserSkill) => {
    try {
      await skillsApi.updateSkill(skill.skill_id!, { enabled: !skill.enabled });
      toast({ variant: "success", title: "操作成功", description: `技能已${!skill.enabled ? '启用' : '停用'}` });
      loadSkills();
    } catch (error) {
      toast({ variant: "destructive", title: "操作失败", description: String(error) });
    }
  };

  const handleDelete = async (skill: UserSkill) => {
    if (!isAdminMode && skill.source !== 'user_created') {
      toast({ variant: "destructive", title: "无法删除", description: "无法删除管理员分配的技能" });
      return;
    }
    showConfirm({
      title: '确认删除',
      description: `确定要删除技能"${skill.display_name}"吗？此操作无法撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await skillsApi.deleteSkill(skill.skill_id!);
          toast({ variant: "success", title: "删除成功", description: "技能已成功删除" });
          loadSkills();
        } catch (error) {
          toast({ variant: "destructive", title: "删除失败", description: "无法删除技能，请稍后重试" });
        }
      },
    });
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedSkill(null);
    setAiDescription('');
    setAiError('');
    setValidationErrors([]);
    setInvalidTools([]);
  };

  const copyToolPlaceholder = (toolName: string) => {
    let text: string;
    const builtin = BUILTIN_TOOLS.find(t => t.name === toolName);
    if (builtin) {
      text = builtin.placeholder;
    } else {
      const tool = tools.find(t => t.name === toolName);
      if (!tool) return;
      const params = tool.input_schema.parameters
        .filter(p => p.required)
        .map(p => `${p.name}="{{input.${p.name}}}"`)
        .join(', ');
      text = `{{tool:${toolName}(${params})}}`;
    }
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const range = document.createRange();
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText = 'position:fixed;top:0;left:0;opacity:0;white-space:pre';
      document.body.appendChild(span);
      range.selectNodeContents(span);
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(range);
      try { document.execCommand('copy'); } catch { toast({ variant: 'destructive', title: '复制失败', description: '请手动选择文本复制' }); }
      sel?.removeAllRanges(); document.body.removeChild(span);
    }
    toast({ title: "已复制", description: text });
  };

  const getDependentToolsInfo = () => {
    const dependentTools = (formData.required_tools || []).map(name => {
      const builtin = BUILTIN_TOOLS.find(t => t.name === name);
      return {
        name,
        tool: tools.find(t => t.name === name),
        builtin,
        isInvalid: invalidTools.includes(name),
      };
    });
    const hasApprovalTools = dependentTools.some(dt => dt.tool?.requires_approval);
    return { dependentTools, hasApprovalTools };
  };

  const { hasApprovalTools } = getDependentToolsInfo();

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // List view
  const sortedSkills = [...skills].sort((a, b) => {
    if (sortBy === 'name') return (a.display_name || '').localeCompare(b.display_name || '');
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return sortBy === 'time-asc' ? ta - tb : tb - ta;
  });

  if (viewMode === 'list') {
    const q = searchQuery.trim().toLowerCase();
    const visibleSkills = sortedSkills.filter((s) => {
      if (q) {
        const hay = `${s.name} ${s.display_name || ''} ${s.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (sourceFilter !== 'all') {
        const src = s.source || 'user_created';
        if (sourceFilter !== src) return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'enabled' && !s.enabled) return false;
        if (statusFilter === 'disabled' && s.enabled) return false;
        if (statusFilter === 'approval' && !s.requires_approval) return false;
      }
      return true;
    });

    const adminCount = skills.filter((s) => s.source === 'admin_assigned').length;
    const userCount = skills.filter((s) => s.source === 'user_created' || !s.source).length;

    return (
      <div className="flex h-full flex-col bg-background">
        <PageHeader
          breadcrumb={['工作区', '技能']}
          subtitle={`${adminCount} 全局 · ${userCount} 私有`}
          actions={
            onBack ? (
              <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-[12px]">
                ← 返回
              </Button>
            ) : undefined
          }
        />

        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-7 pt-6 pb-12">
            <PageTitle
              title="技能"
              description="技能把多个工具按既定流程编排成 Agent 可一键调用的能力。可以为不同业务场景沉淀工作流，附带 prompt 模板和审批策略。"
              actions={
                <Button size="sm" onClick={handleCreate} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  新建技能
                </Button>
              }
            />

            <Toolbar>
              <div className="relative flex-1 min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索技能名、描述…"
                  className="h-8 pl-8 text-[12.5px]"
                />
              </div>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
                <SelectTrigger className="h-8 w-[110px] text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="user_created">私有</SelectItem>
                  <SelectItem value="admin_assigned">全局</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="h-8 w-[110px] text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="enabled">已启用</SelectItem>
                  <SelectItem value="disabled">已停用</SelectItem>
                  <SelectItem value="approval">需审批</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-8 w-[110px] text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time-desc">最新优先</SelectItem>
                  <SelectItem value="time-asc">最早优先</SelectItem>
                  <SelectItem value="name">按名称</SelectItem>
                </SelectContent>
              </Select>
            </Toolbar>

            {visibleSkills.length === 0 ? (
              skills.length === 0 ? (
                <EmptyState
                  icon={<Zap className="h-5 w-5" />}
                  title="暂无技能"
                  description="点击「新建技能」搭一个工作流。技能可以串联多个工具完成更复杂的任务。"
                  action={
                    <Button size="sm" onClick={handleCreate} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      新建技能
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="没有匹配的技能"
                  description="调整筛选条件再试一次。"
                />
              )
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <Table className="table-fixed">
                  <colgroup>
                    <col className="w-[42%]" />
                    <col className="w-[10%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[4%]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="border-b-border bg-muted/40 hover:bg-muted/40">
                      <TableHead className="h-9 px-3">技能</TableHead>
                      <TableHead className="h-9 px-3">来源</TableHead>
                      <TableHead className="h-9 px-3 text-right">工具</TableHead>
                      <TableHead className="h-9 px-3">状态</TableHead>
                      <TableHead className="h-9 px-3 text-right">7天运行</TableHead>
                      <TableHead className="h-9 px-3 text-right">P95</TableHead>
                      <TableHead className="h-9 px-3">更新</TableHead>
                      <TableHead className="h-9 px-3"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSkills.map((s) => {
                      const m = skillMetricsFor(s.name, !!s.enabled);
                      const updated = s.created_at
                        ? new Date(s.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                        : '——';
                      const sourceLabel = s.source === 'admin_assigned' ? '全局' : '私有';
                      return (
                        <TableRow
                          key={s.id}
                          onClick={() => handleEdit(s)}
                          className="cursor-pointer"
                        >
                          <TableCell className="min-w-0 px-3 py-1.5">
                            <div className="flex min-w-0 flex-col">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[13px] font-medium text-foreground">
                                  {s.display_name || s.name}
                                </span>
                                {s.requires_approval && <Pill tone="warning" dot>需审批</Pill>}
                              </div>
                              <span className="truncate text-[11.5px] leading-tight text-muted-foreground">
                                {s.description || s.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            <Pill tone="outline">{sourceLabel}</Pill>
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                            {(s.required_tools || []).length}
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            {/* Status column shows just 启用 / 停用 — the
                                需审批 badge already lives next to the
                                name on the title cell, no need to
                                duplicate it here. */}
                            {s.enabled ? (
                              <Pill tone="success" dot>已启用</Pill>
                            ) : (
                              <Pill tone="neutral" dot>已停用</Pill>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                            {formatRuns(m.runs_7d)}
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                            {m.p95}
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                            {updated}
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
                                <DropdownMenuItem onClick={() => handleEdit(s)}>
                                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                                  编辑
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleEnabled(s)}>
                                  {s.enabled ? (
                                    <>
                                      <Pause className="mr-2 h-3.5 w-3.5" />
                                      停用
                                    </>
                                  ) : (
                                    <>
                                      <Play className="mr-2 h-3.5 w-3.5" />
                                      启用
                                    </>
                                  )}
                                </DropdownMenuItem>
                                {(isAdminMode || s.source === 'user_created' || !s.source) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDelete(s)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      删除
                                    </DropdownMenuItem>
                                  </>
                                )}
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
        <ConfirmDialog />
      </div>
    );
  }

  // Create/Edit view — v3 chrome at 920px container width per design.
  // Body unchanged so existing AI helper, validation, built-in tools
  // card all keep working.
  const skillRequiredTools = (formData.required_tools || []).length;
  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        breadcrumb={
          viewMode === 'create'
            ? ['工作区', '技能', '新建']
            : ['工作区', '技能', formData.name || '编辑']
        }
        subtitle={viewMode === 'create' ? '新建技能' : '编辑模式'}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 px-2 text-[12px]">
              放弃
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: '预览对话即将开放',
                  description: '此入口尚未接通沙箱对话；当前先用「保存」后到主对话页测试。',
                })
              }
              className="h-7 gap-1.5 px-3 text-[12px]"
            >
              <Play className="h-3.5 w-3.5" />
              预览对话
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={invalidTools.length > 0 || validationErrors.length > 0}
              className="h-7 gap-1.5 px-3 text-[12px]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {viewMode === 'create' ? '创建并保存' : '保存'}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-7 pt-6 pb-12">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
                {viewMode === 'create'
                  ? '新建技能'
                  : (formData.display_name || formData.name || '编辑技能')}
              </h1>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {viewMode === 'create'
                  ? '描述你想让 Agent 完成的工作流，用 AI 助手或手动配置 prompt 模板与依赖工具。'
                  : (
                    <>
                      技能 · {skillRequiredTools} 个工具
                      {formData.requires_approval && ' · 需审批'}
                      {formData.name && ` · ${formData.name}`}
                    </>
                  )}
              </p>
            </div>
            {viewMode === 'edit' && (
              formData.enabled
                ? <Pill tone="success" dot>已启用</Pill>
                : <Pill tone="neutral" dot>已停用</Pill>
            )}
          </div>

      <div className="space-y-8">
        {/* AI Helper Section */}
        <Collapsible defaultOpen={false}>
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    AI 辅助生成
                  </CardTitle>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
                </div>
                <CardDescription>
                  {viewMode === 'create'
                    ? '用自然语言描述您想要的技能，AI 将自动生成完整的工作流程'
                    : '用自然语言描述新的需求，AI 将帮助您优化和更新工作流程'}
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <Textarea
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder={viewMode === 'create'
                    ? "例如：查询用户的评论记录并分析情感倾向"
                    : "例如：在现有流程基础上，增加数据验证和错误处理"}
                  rows={3}
                  disabled={aiGenerating}
                  className="resize-none"
                />
                {aiError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{aiError}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleAIGenerate}
                    disabled={aiGenerating || !aiDescription.trim()}
                    className="flex-1"
                  >
                    {aiGenerating ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2"></span>
                        生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {viewMode === 'create' ? 'AI 生成技能' : 'AI 优化技能'}
                      </>
                    )}
                  </Button>
                </div>
                {viewMode === 'edit' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" />
                    提示：AI将在保留技能名称的基础上更新其他配置
                  </p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="skill-name" className="flex items-center gap-2">
                  技能名称 (name) *
                  {viewMode === 'edit' && (
                    <span className="text-xs font-normal text-chart-4">
                      🔒 编辑时不可修改
                    </span>
                  )}
                </Label>
                <Input
                  id="skill-name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={viewMode === 'edit'}
                  placeholder="例如: analyze_sentiment"
                  className={viewMode === 'edit' ? 'cursor-not-allowed' : ''}
                />
                <p className="text-sm text-muted-foreground">
                  {viewMode === 'edit' ? '技能名称是唯一标识符，创建后不可修改' : '用于代码调用的唯一标识符'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-display-name">显示名称 *</Label>
                <Input
                  id="skill-display-name"
                  value={formData.display_name || ''}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="例如: 情感分析"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-category">分类 *</Label>
              <Select
                value={formData.category || 'analysis'}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="skill-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">分析 (analysis)</SelectItem>
                  <SelectItem value="extraction">提取 (extraction)</SelectItem>
                  <SelectItem value="comparison">对比 (comparison)</SelectItem>
                  <SelectItem value="automation">自动化 (automation)</SelectItem>
                  <SelectItem value="reporting">报告生成 (reporting)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-description">描述 *</Label>
              <Textarea
                id="skill-description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="技能的详细描述"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-calling-guide">调用指南</Label>
              <Textarea
                id="skill-calling-guide"
                value={formData.calling_guide || ''}
                onChange={(e) => setFormData({ ...formData, calling_guide: e.target.value })}
                placeholder="何时使用这个技能以及如何使用"
                rows={2}
              />
              <p className="text-sm text-muted-foreground">这段文字会帮助AI更好地理解和使用技能</p>
            </div>
          </CardContent>
        </Card>

        {/* Workflow Template */}
        <Card>
          <CardHeader>
            <CardTitle>工作流程模板</CardTitle>
            <CardDescription className="space-y-2">
              <span>支持占位符: {'{{input.xxx}}'}, {'{{tool:xxx(...)}}'}, {'{{result.xxx.yyy}}'}</span>
              <div className="text-xs mt-2 space-y-1">
                <div><code className="bg-muted px-1.5 py-0.5 rounded">{'{{input.param_name}}'}</code> - 引用输入参数</div>
                <div><code className="bg-muted px-1.5 py-0.5 rounded">{'{{tool:tool_name(arg="value")}}'}</code> - 调用工具</div>
                <div><code className="bg-muted px-1.5 py-0.5 rounded">{'{{result.tool_name.field}}'}</code> - 引用工具返回结果</div>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={formData.prompt_template || ''}
              onChange={(e) => {
                setFormData({ ...formData, prompt_template: e.target.value });
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
              placeholder={`步骤1: 查询用户信息\n{{tool:query_database(table="users", filter="id={{input.user_id}}")}}\n\n步骤2: 分析行为\n基于结果 {{result.query_database.username}} 进行分析...`}
              className="font-mono text-sm resize-none"
              rows={12}
            />
            {validationErrors.length > 0 && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                {validationErrors.map((err, idx) => (
                  <p key={idx} className="text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-right">
              {(formData.prompt_template || '').length} 字符
            </p>
          </CardContent>
        </Card>

        {/* Approval Setting */}
        <Card className={hasApprovalTools ? "border-chart-4/30" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {hasApprovalTools && <AlertCircle className="w-5 h-5 text-chart-4" />}
              审批设置
            </CardTitle>
            <CardDescription>
              {hasApprovalTools
                ? '检测到依赖的工具中有需要审批的工具，请选择审批方式'
                : '选择此技能是否需要在执行前进行审批'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent">
              <input
                type="radio"
                name="approval"
                checked={!formData.requires_approval}
                onChange={() => setFormData({ ...formData, requires_approval: false })}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  <Unlock className="w-4 h-4" />
                  无需技能级审批{!hasApprovalTools && '（推荐）'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasApprovalTools
                    ? '执行技能时不需要整体审批，但调用需要审批的工具时会单独弹出审批框'
                    : '执行此技能时不需要审批，直接运行'}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent">
              <input
                type="radio"
                name="approval"
                checked={formData.requires_approval === true}
                onChange={() => setFormData({ ...formData, requires_approval: true })}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  需要技能级审批
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasApprovalTools
                    ? '执行技能前需要整体审批一次，通过后所有依赖的工具无需再次审批'
                    : '执行此技能前需要审批确认'}
                </p>
              </div>
            </label>
          </CardContent>
        </Card>

        {/* Built-in (always-bound) tools — collapsed by default */}
        <Card className="border-primary/20">
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowBuiltinTools(!showBuiltinTools)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                内置工具（无需配置，所有技能可直接调用）
              </CardTitle>
              {showBuiltinTools ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </div>
            <CardDescription>
              这些工具由系统提供，<b>不会</b>出现在下方"可用工具"列表里，但 LLM 始终能看到。
              在 prompt 模板里直接写工具名（或用占位符），技能就能调用它们。
            </CardDescription>
          </CardHeader>
          {showBuiltinTools && (
            <CardContent className="space-y-2">
              {BUILTIN_TOOLS.map((bt) => (
                <div
                  key={bt.name}
                  onClick={() => copyToolPlaceholder(bt.name)}
                  className="p-3 bg-muted/40 hover:bg-accent rounded-lg cursor-pointer transition-colors flex items-start gap-2"
                >
                  <Copy className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">{bt.display_name}</span>
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {bt.name}
                      </code>
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        <Sparkles className="w-3 h-3 mr-1" /> 内置
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{bt.description}</p>
                    <code className="block text-[11px] mt-1.5 text-muted-foreground/80 bg-background/60 border border-border/40 rounded px-2 py-1 break-words [overflow-wrap:anywhere]">
                      {bt.placeholder}
                    </code>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        {/* Tool Dependencies */}
        <Card>
          <CardHeader>
            <CardTitle>依赖的工具</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.required_tools && formData.required_tools.length > 0 ? (
              <div className="space-y-3">
                {getDependentToolsInfo().dependentTools.map(({ name, tool, builtin, isInvalid }) => (
                  <div
                    key={name}
                    className={`p-4 rounded-lg border ${
                      isInvalid ? 'bg-destructive/10 border-destructive/20' : 'bg-muted/50 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{tool?.display_name || builtin?.display_name || name}</span>
                      {builtin && (
                        <Badge variant="outline" className="border-primary/40 text-primary">
                          <Sparkles className="w-3 h-3 mr-1" /> 内置
                        </Badge>
                      )}
                      {tool?.requires_approval && (
                        <Badge variant="outline" className="border-chart-4/50 text-chart-4">
                          <Lock className="w-3 h-3 mr-1" /> 需要审批
                        </Badge>
                      )}
                      {isInvalid && (
                        <Badge variant="destructive">
                          <AlertCircle className="w-3 h-3 mr-1" /> 工具不存在
                        </Badge>
                      )}
                    </div>
                    {(tool || builtin) && (
                      <p className="text-sm text-muted-foreground">
                        {tool?.description || builtin?.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂未检测到工具依赖</p>
            )}

            {/* Available Tools */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAvailableTools(!showAvailableTools)}
                className="px-0 text-primary"
              >
                {showAvailableTools ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                查看可用工具（点击复制占位符）
              </Button>
              {showAvailableTools && (
                <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      onClick={() => copyToolPlaceholder(tool.name)}
                      className="p-3 bg-muted/50 hover:bg-accent rounded-lg cursor-pointer transition-colors flex items-start gap-2"
                    >
                      <Copy className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{tool.display_name}</span>
                          <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {tool.name}
                          </code>
                        </div>
                        <p className="text-sm text-muted-foreground">{tool.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Advanced Configuration */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
            <div className="flex items-center justify-between">
              <CardTitle>高级配置（可选）</CardTitle>
              {showAdvanced ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </div>
          </CardHeader>
          {showAdvanced && (
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>输入Schema (JSON)</Label>
                <Textarea
                  value={JSON.stringify(formData.input_schema, null, 2)}
                  onChange={(e) => {
                    try { setFormData({ ...formData, input_schema: JSON.parse(e.target.value) }); } catch {}
                  }}
                  className="font-mono text-sm resize-none"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>输出Schema (JSON)</Label>
                <Textarea
                  value={JSON.stringify(formData.output_schema, null, 2)}
                  onChange={(e) => {
                    try { setFormData({ ...formData, output_schema: JSON.parse(e.target.value) }); } catch {}
                  }}
                  className="font-mono text-sm resize-none"
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>质量标准 (一行一个)</Label>
                <Textarea
                  value={(formData.quality_criteria || []).join('\n')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quality_criteria: e.target.value.split('\n').filter((x) => x.trim()),
                    })
                  }
                  placeholder={"数据准确\n逻辑清晰\n结果可验证"}
                  rows={3}
                />
              </div>
            </CardContent>
          )}
        </Card>
      </div>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
};
