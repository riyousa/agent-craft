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
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';

type ViewMode = 'list' | 'create' | 'edit';

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
    const availableToolNames = tools.map(t => t.name);
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
    const tool = tools.find(t => t.name === toolName);
    if (!tool) return;
    const params = tool.input_schema.parameters
      .filter(p => p.required)
      .map(p => `${p.name}="{{input.${p.name}}}"`)
      .join(', ');
    const text = `{{tool:${toolName}(${params})}}`;
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
    const dependentTools = (formData.required_tools || []).map(name => ({
      name,
      tool: tools.find(t => t.name === name),
      isInvalid: invalidTools.includes(name),
    }));
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
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <>
                <Button variant="ghost" size="sm" onClick={onBack}>← 返回</Button>
                <Separator orientation="vertical" className="h-4" />
              </>
            )}
            <p className="text-sm text-muted-foreground">
              共 {skills.length} 个技能
            </p>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="time-desc">最新优先</SelectItem>
                <SelectItem value="time-asc">最早优先</SelectItem>
                <SelectItem value="name">按名称</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            创建技能
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skills.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Zap className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">暂无技能</h3>
                <p className="text-muted-foreground mb-4">点击"创建技能"按钮添加您的第一个技能</p>
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建技能
                </Button>
              </CardContent>
            </Card>
          ) : (
            sortedSkills.map((skill) => (
              <Card
                key={skill.id}
                className={`flex flex-col transition-all hover:shadow-md ${!skill.enabled ? 'opacity-60' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${skill.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{skill.display_name}</CardTitle>
                        <code className="text-xs text-muted-foreground">{skill.name}</code>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="mt-2 line-clamp-2">{skill.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pb-3">
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Badge variant={skill.source === 'user_created' ? 'default' : 'secondary'}>
                      {skill.source === 'user_created' ? '自建' : '系统'}
                    </Badge>
                    <Badge variant="outline">{skill.category}</Badge>
                    {!skill.enabled && <Badge variant="outline">已停用</Badge>}
                    {skill.requires_approval && (
                      <Badge variant="outline" className="border-chart-4/50 text-chart-4">
                        需审批
                      </Badge>
                    )}
                  </div>
                  {skill.required_tools && skill.required_tools.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      依赖 {skill.required_tools.length} 个工具
                    </p>
                  )}
                </CardContent>
                <Separator />
                <div className="flex items-center justify-end gap-1 p-3">
                  <Button variant="ghost" size="sm" onClick={() => handleToggleEnabled(skill)}>
                    {skill.enabled ? <Pause className="w-4 h-4 mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
                    {skill.enabled ? '停用' : '启用'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(skill)}>
                    <Edit2 className="w-4 h-4 mr-1.5" />
                    编辑
                  </Button>
                  {(isAdminMode || skill.source === 'user_created') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(skill)}
                      className="text-chart-5 hover:text-chart-5"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      删除
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
        <ConfirmDialog />
      </div>
    );
  }

  // Create/Edit view
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            ← 返回
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">
            {viewMode === 'create' ? '创建新技能' : `编辑 · ${formData.display_name || formData.name}`}
          </span>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleCancel}>取消</Button>
          <Button
            onClick={handleSave}
            disabled={invalidTools.length > 0 || validationErrors.length > 0}
          >
            {viewMode === 'create' ? '创建' : '保存'}
          </Button>
        </div>
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

        {/* Tool Dependencies */}
        <Card>
          <CardHeader>
            <CardTitle>依赖的工具</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.required_tools && formData.required_tools.length > 0 ? (
              <div className="space-y-3">
                {getDependentToolsInfo().dependentTools.map(({ name, tool, isInvalid }) => (
                  <div
                    key={name}
                    className={`p-4 rounded-lg border ${
                      isInvalid ? 'bg-destructive/10 border-destructive/20' : 'bg-muted/50 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{tool?.display_name || name}</span>
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
                    {tool && <p className="text-sm text-muted-foreground">{tool.description}</p>}
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
      <ConfirmDialog />
    </div>
  );
};
