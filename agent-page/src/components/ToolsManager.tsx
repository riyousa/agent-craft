import React, { useState, useEffect } from 'react';
import { userApi, UserTool, ToolParameter, ToolOutputField, ToolsApi, McpExecutionConfig, DiscoveredMcpTool } from '../api/user';
import {
  Plus,
  Wrench,
  Pause,
  Play,
  Edit2,
  Trash2,
  Bot,
  Sparkles,
  AlertCircle,
  Lightbulb,
  Link2,
  ClipboardList,
  Search,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Server,
  Upload,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { JsonEditor } from './ui/json-editor';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription,
  DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger,
} from './ui/drawer';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';
import { PageHeader, PageTitle, Toolbar, Pill, EmptyState, H2, Field } from './design';
import { metricsFor, formatCalls } from '../mock/tool_metrics';
import { cn } from '../lib/utils';

type ViewMode = 'list' | 'create' | 'edit';

interface ToolsManagerProps {
  api?: ToolsApi;
  onBack?: () => void;
}

export const ToolsManager: React.FC<ToolsManagerProps> = ({ api, onBack }) => {
  const toolsApi: ToolsApi = api || userApi;
  const isAdminMode = !!api;
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();
  const [tools, setTools] = useState<UserTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'time-desc' | 'time-asc' | 'name'>('time-desc');
  // List-view filter state — purely client-side until the backend
  // exposes server-side filtering hooks (Phase 4).
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'http' | 'mcp'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'user_created' | 'admin_assigned'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'approval'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTool, setSelectedTool] = useState<UserTool | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testParamsText, setTestParamsText] = useState('{}');
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);
  const [testEndpoint, setTestEndpoint] = useState('');
  const [testMethod, setTestMethod] = useState('POST');

  // Resolve request_mapping templates to concrete test values
  const resolveTemplates = (obj: any): any => {
    if (typeof obj === 'string') {
      // {{param | default: value}} → extract default
      const defaultMatch = obj.match(/\{\{.*?\|\s*default:\s*(.+?)\}\}/);
      if (defaultMatch) {
        let dv = defaultMatch[1].trim();
        if ((dv.startsWith("'") && dv.endsWith("'")) || (dv.startsWith('"') && dv.endsWith('"')))
          return dv.slice(1, -1);
        if (dv === 'true') return true;
        if (dv === 'false') return false;
        if (!isNaN(Number(dv))) return Number(dv);
        return dv;
      }
      // {{param}} → empty placeholder
      if (/^\{\{\w+\}\}$/.test(obj)) return '';
      // ${user.*} or ${ENV} → keep as marker
      if (/\$\{/.test(obj)) return obj;
      return obj;
    }
    if (Array.isArray(obj)) return obj.map(resolveTemplates);
    if (obj && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) result[k] = resolveTemplates(v);
      return result;
    }
    return obj;
  };

  const openTestDrawer = () => {
    try {
      const mapping = JSON.parse(requestMappingText || '{}');
      const resolved = resolveTemplates(mapping);

      // Merge: keep user-entered values, fill missing from resolved mapping
      try {
        const existing = JSON.parse(testParamsText || '{}');
        const deepMerge = (target: any, source: any): any => {
          if (source && typeof source === 'object' && !Array.isArray(source)) {
            const merged = { ...source };
            for (const [k, v] of Object.entries(target)) {
              if (v !== '' && v !== undefined) merged[k] = typeof v === 'object' && !Array.isArray(v) ? deepMerge(v, source[k] || {}) : v;
            }
            return merged;
          }
          return target || source;
        };
        setTestParamsText(JSON.stringify(deepMerge(existing, resolved), null, 2));
      } catch {
        setTestParamsText(JSON.stringify(resolved, null, 2));
      }
    } catch {
      // No valid mapping — add params from input_schema
      const params: Record<string, any> = {};
      for (const p of formData.input_schema?.parameters || []) {
        params[p.name] = p.default ?? '';
      }
      setTestParamsText(JSON.stringify(params, null, 2));
    }

    setTestEndpoint(formData.execution?.config?.endpoint || '');
    setTestMethod(formData.execution?.config?.method || 'POST');
    setTestResult(null);
    setTestDrawerOpen(true);
  };
  const [headersError, setHeadersError] = useState<string>('');
  const [requestMappingError, setRequestMappingError] = useState<string>('');
  const [responseMappingError, setResponseMappingError] = useState<string>('');
  const [headersText, setHeadersText] = useState<string>('');
  const [requestMappingText, setRequestMappingText] = useState<string>('');
  const [responseMappingText, setResponseMappingText] = useState<string>('');
  const [aiDescription, setAiDescription] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>('');

  // MCP discover/import drawer state
  const [mcpDrawerOpen, setMcpDrawerOpen] = useState(false);
  const [mcpConfig, setMcpConfig] = useState<McpExecutionConfig>({
    transport: 'http',
    url: '',
    headers: {},
    auth: { type: 'none' },
    timeout: 30,
  });
  const [mcpHeadersText, setMcpHeadersText] = useState<string>('{}');
  const [mcpCommandText, setMcpCommandText] = useState<string>('');
  const [mcpDiscovering, setMcpDiscovering] = useState(false);
  const [mcpImporting, setMcpImporting] = useState(false);
  const [mcpDiscovered, setMcpDiscovered] = useState<DiscoveredMcpTool[]>([]);
  const [mcpSelected, setMcpSelected] = useState<Set<string>>(new Set());
  const [mcpDiscoverError, setMcpDiscoverError] = useState<string>('');
  const [formData, setFormData] = useState<Partial<UserTool>>({
    name: '',
    display_name: '',
    description: '',
    calling_guide: '',
    calling_examples: [],
    input_schema: { parameters: [] },
    output_schema: { type: 'list', item_fields: [] },
    execution: {
      type: 'rest_api',
      config: {
        method: 'POST',
        endpoint: '',
        headers: { 'Content-Type': 'application/json' },
        auth: { type: 'none' },
        timeout: 10,
        retry: { max_attempts: 0, backoff_ms: 1000 }
      },
      request_mapping: {},
      response_mapping: { root_path: '', field_mapping: {} }
    },
    requires_approval: false,
    enabled: true,
  });

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setLoading(true);
    try {
      const data = await toolsApi.listTools();
      setTools(data);
    } catch (error) {
      toast({ variant: "destructive", title: "加载失败", description: "无法加载工具列表" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedTool(null);
    setTestResult(null);
    setHeadersError('');
    setRequestMappingError('');
    setResponseMappingError('');
    setAiDescription('');
    setAiError('');

    const initialData = {
      name: '',
      display_name: '',
      description: '',
      calling_guide: '',
      calling_examples: [],
      input_schema: { parameters: [] },
      output_schema: { type: 'list', item_fields: [] },
      execution: {
        type: 'rest_api',
        config: {
          method: 'POST',
          endpoint: '',
          headers: { 'Content-Type': 'application/json' },
          auth: { type: 'none' },
          timeout: 10,
          retry: { max_attempts: 0, backoff_ms: 1000 }
        },
        request_mapping: {},
        response_mapping: { root_path: '', field_mapping: {} }
      },
      requires_approval: false,
      enabled: true,
    };

    setFormData(initialData);
    setHeadersText(JSON.stringify(initialData.execution.config.headers, null, 2));
    setRequestMappingText(JSON.stringify(initialData.execution.request_mapping, null, 2));
    setResponseMappingText(JSON.stringify(initialData.execution.response_mapping, null, 2));
    setViewMode('create');
  };

  const handleEdit = (tool: UserTool) => {
    setSelectedTool(tool);
    setTestResult(null);
    setHeadersError('');
    setRequestMappingError('');
    setResponseMappingError('');
    setAiDescription('');
    setAiError('');
    setFormData(tool);
    setHeadersText(JSON.stringify(tool.execution?.config?.headers || {}, null, 2));
    setRequestMappingText(JSON.stringify(tool.execution?.request_mapping || {}, null, 2));
    setResponseMappingText(JSON.stringify(tool.execution?.response_mapping || {}, null, 2));
    setViewMode('edit');
  };

  const handleSave = async () => {
    try {
      const headers = JSON.parse(headersText);
      const requestMapping = JSON.parse(requestMappingText);
      const responseMapping = JSON.parse(responseMappingText);

      const dataToSave = {
        ...formData,
        execution: {
          ...formData.execution,
          config: {
            ...formData.execution?.config,
            headers,
          },
          request_mapping: requestMapping,
          response_mapping: responseMapping,
        },
      };

      if (viewMode === 'create') {
        await toolsApi.createTool(dataToSave as UserTool);
        toast({
          variant: "success",
          title: "创建成功",
          description: "工具已成功创建",
        });
      } else if (selectedTool && selectedTool.tool_id) {
        await toolsApi.updateTool(selectedTool.tool_id, dataToSave);
        toast({
          variant: "success",
          title: "更新成功",
          description: "工具已成功更新",
        });
      }
      setViewMode('list');
      setSelectedTool(null);
      loadTools();
    } catch (error: any) {
      console.error('Failed to save tool:', error);
      if (error instanceof SyntaxError) {
        toast({
          variant: "destructive",
          title: "JSON格式错误",
          description: "请检查请求头、请求映射和响应映射的格式",
        });
      } else {
        toast({
          variant: "destructive",
          title: "保存失败",
          description: error.message || '未知错误',
        });
      }
    }
  };

  const handleDelete = async (tool: UserTool) => {
    console.log('[UserToolsManager] handleDelete called for:', tool.display_name);

    if (!isAdminMode && tool.source !== 'user_created') {
      toast({
        variant: "destructive",
        title: "无法删除",
        description: "无法删除管理员分配的工具",
      });
      return;
    }

    console.log('[UserToolsManager] Calling showConfirm...');
    showConfirm({
      title: '确认删除',
      description: `确定要删除工具"${tool.display_name}"吗？此操作无法撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      onConfirm: async () => {
        console.log('[UserToolsManager] Confirm button clicked');
        try {
          await toolsApi.deleteTool(tool.tool_id!);
          toast({
            variant: "success",
            title: "删除成功",
            description: "工具已成功删除",
          });
          loadTools();
        } catch (error) {
          console.error('Failed to delete tool:', error);
          toast({
            variant: "destructive",
            title: "删除失败",
            description: "无法删除工具，请稍后重试",
          });
        }
      },
    });
  };

  const handleTest = async () => {
    if (!testEndpoint) {
      toast({ variant: 'destructive', title: '请先配置API端点' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let params = {};
      try { params = JSON.parse(testParamsText); } catch {}

      // Build execution config with test-specific endpoint/method override
      const execution = {
        ...formData.execution,
        config: {
          ...formData.execution?.config,
          endpoint: testEndpoint,
          method: testMethod,
          headers: JSON.parse(headersText || '{}'),
        },
        request_mapping: JSON.parse(requestMappingText || '{}'),
        response_mapping: JSON.parse(responseMappingText || '{}'),
      };

      const result = await toolsApi.testConfig(execution, params);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        ok: false,
        message: error.message || '测试失败',
        latency_ms: 0
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleEnabled = async (tool: UserTool) => {
    try {
      await toolsApi.updateTool(tool.tool_id!, { enabled: !tool.enabled });
      toast({
        variant: "success",
        title: "操作成功",
        description: `工具已${!tool.enabled ? '启用' : '停用'}`,
      });
      loadTools();
    } catch (error) {
      console.error('Failed to toggle tool:', error);
      toast({
        variant: "destructive",
        title: "操作失败",
        description: "无法更改工具状态，请稍后重试",
      });
    }
  };

  const handleCancel = () => {
    setViewMode('list');
    setSelectedTool(null);
    setTestResult(null);
    setHeadersError('');
    setRequestMappingError('');
    setResponseMappingError('');
    setHeadersText('');
    setRequestMappingText('');
    setResponseMappingText('');
    setAiDescription('');
    setAiError('');
  };

  const updateExecution = (path: string, value: any) => {
    const newExecution = { ...formData.execution };
    const keys = path.split('.');
    let current: any = newExecution;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setFormData({ ...formData, execution: newExecution });
  };

  const addParameter = () => {
    const newParam: ToolParameter = {
      name: '',
      type: 'string',
      required: false,
      description: '',
    };
    setFormData({
      ...formData,
      input_schema: {
        parameters: [...(formData.input_schema?.parameters || []), newParam],
      },
    });
  };

  const updateParameter = (index: number, field: keyof ToolParameter, value: any) => {
    const params = [...(formData.input_schema?.parameters || [])];
    params[index] = { ...params[index], [field]: value };
    setFormData({ ...formData, input_schema: { parameters: params } });
  };

  const removeParameter = (index: number) => {
    const params = [...(formData.input_schema?.parameters || [])];
    params.splice(index, 1);
    setFormData({ ...formData, input_schema: { parameters: params } });
  };

  const addOutputField = () => {
    const newField: ToolOutputField = {
      name: '',
      type: 'string',
      description: '',
    };
    setFormData({
      ...formData,
      output_schema: {
        ...formData.output_schema,
        item_fields: [...(formData.output_schema?.item_fields || []), newField],
      } as any,
    });
  };

  const updateOutputField = (index: number, field: keyof ToolOutputField, value: any) => {
    const fields = [...(formData.output_schema?.item_fields || [])];
    fields[index] = { ...fields[index], [field]: value };
    setFormData({
      ...formData,
      output_schema: { ...formData.output_schema, item_fields: fields } as any,
    });
  };

  const removeOutputField = (index: number) => {
    const fields = [...(formData.output_schema?.item_fields || [])];
    fields.splice(index, 1);
    setFormData({
      ...formData,
      output_schema: { ...formData.output_schema, item_fields: fields } as any,
    });
  };

  const openMcpDrawer = () => {
    setMcpConfig({
      transport: 'http',
      url: '',
      headers: {},
      auth: { type: 'none' },
      timeout: 30,
    });
    setMcpHeadersText('{}');
    setMcpCommandText('');
    setMcpDiscovered([]);
    setMcpSelected(new Set());
    setMcpDiscoverError('');
    setMcpDrawerOpen(true);
  };

  const buildMcpConfigForRequest = (): McpExecutionConfig | null => {
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(mcpHeadersText || '{}');
    } catch {
      setMcpDiscoverError('请求头 JSON 格式错误');
      return null;
    }

    const cfg: McpExecutionConfig = {
      transport: mcpConfig.transport,
      timeout: mcpConfig.timeout,
      headers,
      auth: mcpConfig.auth,
    };

    if (mcpConfig.transport === 'stdio') {
      const cmd = mcpCommandText.trim().split(/\s+/).filter(Boolean);
      if (cmd.length === 0) {
        setMcpDiscoverError('请填写启动命令，例如: npx -y @modelcontextprotocol/server-filesystem /tmp');
        return null;
      }
      cfg.command = cmd;
    } else {
      if (!mcpConfig.url) {
        setMcpDiscoverError('请填写 Server URL');
        return null;
      }
      cfg.url = mcpConfig.url;
    }
    return cfg;
  };

  const handleMcpDiscover = async () => {
    setMcpDiscoverError('');
    setMcpDiscovered([]);
    setMcpSelected(new Set());
    const cfg = buildMcpConfigForRequest();
    if (!cfg) return;

    setMcpDiscovering(true);
    try {
      const res = await toolsApi.discoverMcpTools(cfg);
      setMcpDiscovered(res.tools || []);
      // Default-select all so the common case is one click to import
      setMcpSelected(new Set((res.tools || []).map((t) => t.name)));
      if ((res.tools || []).length === 0) {
        setMcpDiscoverError('Server 未暴露任何工具');
      }
    } catch (e: any) {
      setMcpDiscoverError(e?.response?.data?.detail || e?.message || '连接失败');
    } finally {
      setMcpDiscovering(false);
    }
  };

  const handleMcpImport = async () => {
    const cfg = buildMcpConfigForRequest();
    if (!cfg) return;
    if (mcpSelected.size === 0) {
      toast({ variant: 'destructive', title: '未选择工具' });
      return;
    }
    setMcpImporting(true);
    try {
      const selectedTools = mcpDiscovered
        .filter((t) => mcpSelected.has(t.name))
        .map((t) => ({
          name: t.name,
          display_name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        }));
      const res = await toolsApi.importMcpTools(cfg, selectedTools);
      toast({
        variant: 'success',
        title: '导入完成',
        description: res.message,
      });
      setMcpDrawerOpen(false);
      loadTools();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: '导入失败',
        description: e?.response?.data?.detail || e?.message || '未知错误',
      });
    } finally {
      setMcpImporting(false);
    }
  };

  const toggleMcpSelected = (name: string) => {
    setMcpSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAIGenerate = async () => {
    if (!aiDescription.trim()) {
      setAiError('请输入API描述');
      return;
    }

    setAiLoading(true);
    setAiError('');

    try {
      const { chatApi } = await import('../api/client');
      const response = await chatApi.parseToolConfig(aiDescription);

      const config = response.tool_config;

      // 在编辑模式下，保留原有的 name 和 tool_id
      const mergedConfig = viewMode === 'edit'
        ? {
            ...config,
            name: formData.name, // 保留原有工具名称
            tool_id: formData.tool_id, // 保留原有工具ID
          }
        : config;

      setFormData(mergedConfig);
      setHeadersText(JSON.stringify(config.execution?.config?.headers || {}, null, 2));
      setRequestMappingText(JSON.stringify(config.execution?.request_mapping || {}, null, 2));
      setResponseMappingText(JSON.stringify(config.execution?.response_mapping || {}, null, 2));

      setAiDescription('');
      toast({
        variant: "success",
        title: "配置已生成",
        description: viewMode === 'edit'
          ? "AI已自动填充配置（工具名称已保留），请检查并保存"
          : "AI已自动填充配置，请检查并保存",
      });
    } catch (err: any) {
      setAiError(err.response?.data?.detail || 'AI解析失败，请重试');
    } finally {
      setAiLoading(false);
    }
  };

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

  const sortedTools = [...tools].sort((a, b) => {
    if (sortBy === 'name') return (a.display_name || '').localeCompare(b.display_name || '');
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return sortBy === 'time-asc' ? ta - tb : tb - ta;
  });

  // List view
  if (viewMode === 'list') {
    // Filtered + sorted list. Filters apply on top of the existing
    // sortedTools order. Search matches name/display_name/description.
    const q = searchQuery.trim().toLowerCase();
    const visibleTools = sortedTools.filter((t) => {
      if (q) {
        const hay = `${t.name} ${t.display_name || ''} ${t.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== 'all') {
        const isMcp = t.execution?.type === 'mcp';
        if (typeFilter === 'mcp' && !isMcp) return false;
        if (typeFilter === 'http' && (isMcp || t.execution?.type === 'sql')) return false;
      }
      if (sourceFilter !== 'all') {
        const src = t.source || 'user_created';
        if (sourceFilter !== src) return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'enabled' && !t.enabled) return false;
        if (statusFilter === 'disabled' && t.enabled) return false;
        if (statusFilter === 'approval' && !t.requires_approval) return false;
      }
      return true;
    });

    const adminCount = tools.filter((t) => t.source === 'admin_assigned').length;
    const userCount = tools.filter((t) => t.source === 'user_created' || !t.source).length;

    return (
      <div className="flex h-full flex-col bg-background">
        <PageHeader
          breadcrumb={['工作区', '工具']}
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
              title="工具"
              description="工具是 Agent 可以调用的具体能力。HTTP 接口、SQL 查询、JS 脚本均可注册为工具，并支持参数校验、审批策略与权限控制。"
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toast({
                        title: '导入 OpenAPI 即将开放',
                        description: '此入口尚未接通后端 OpenAPI 解析；先用「新建工具」或「导入 MCP 服务」。',
                      })
                    }
                    className="gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    导入 OpenAPI
                  </Button>
                  <Button variant="outline" size="sm" onClick={openMcpDrawer} className="gap-1.5">
                    <Server className="h-3.5 w-3.5" />
                    导入 MCP 服务
                  </Button>
                  <Button size="sm" onClick={handleCreate} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    新建工具
                  </Button>
                </>
              }
            />

            <Toolbar>
              <div className="relative flex-1 min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索工具名、描述…"
                  className="h-8 pl-8 text-[12.5px]"
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger className="h-8 w-[110px] text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="mcp">MCP</SelectItem>
                </SelectContent>
              </Select>
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

            {visibleTools.length === 0 ? (
              tools.length === 0 ? (
                <EmptyState
                  icon={<Wrench className="h-5 w-5" />}
                  title="暂无工具"
                  description="点击「新建工具」添加你的第一个 API 工具，或导入 MCP 服务批量接入。"
                  action={
                    <Button size="sm" onClick={handleCreate} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      新建工具
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="没有匹配的工具"
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
                      <TableHead className="h-9 px-3">工具</TableHead>
                      <TableHead className="h-9 px-3">类型</TableHead>
                      <TableHead className="h-9 px-3">来源</TableHead>
                      <TableHead className="h-9 px-3">状态</TableHead>
                      <TableHead className="h-9 px-3 text-right">7天调用</TableHead>
                      <TableHead className="h-9 px-3 text-right">P95</TableHead>
                      <TableHead className="h-9 px-3">更新</TableHead>
                      <TableHead className="h-9 px-3"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTools.map((t) => {
                      const isMcp = t.execution?.type === 'mcp';
                      const method = (t.execution?.config?.method || 'POST').toUpperCase();
                      const m = metricsFor(t.name, !!t.enabled);
                      const updated = t.created_at
                        ? new Date(t.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                        : '——';
                      const sourceLabel = t.source === 'admin_assigned' ? '全局' : '私有';
                      return (
                        <TableRow
                          key={t.id}
                          onClick={() => handleEdit(t)}
                          className="cursor-pointer"
                        >
                          <TableCell className="min-w-0 px-3 py-1.5">
                            <div className="flex min-w-0 flex-col">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono text-[12.5px] font-medium text-foreground">
                                  {t.name}
                                </span>
                                {t.requires_approval && <Pill tone="warning" dot>需审批</Pill>}
                              </div>
                              <span className="truncate text-[11.5px] leading-tight text-muted-foreground">
                                {t.description || t.display_name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            {isMcp ? (
                              <Pill tone="info" mono>MCP</Pill>
                            ) : (
                              <Pill tone="info" mono>{method}</Pill>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            <Pill tone="outline">{sourceLabel}</Pill>
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            {/* Status column shows just 启用 / 停用 — the
                                需审批 badge already lives next to the
                                name on the title cell, no need to
                                duplicate it here. */}
                            {t.enabled ? (
                              <Pill tone="success" dot>已启用</Pill>
                            ) : (
                              <Pill tone="neutral" dot>已停用</Pill>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                            {formatCalls(m.calls_7d)}
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
                                <DropdownMenuItem onClick={() => handleEdit(t)}>
                                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                                  编辑
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleEnabled(t)}>
                                  {t.enabled ? (
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
                                {(isAdminMode || t.source === 'user_created' || !t.source) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDelete(t)}
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

        <Drawer open={mcpDrawerOpen} onOpenChange={setMcpDrawerOpen}>
          <DrawerContent>
            <div className="mx-auto w-full max-w-3xl max-h-[85vh] flex flex-col">
              <DrawerHeader>
                <DrawerTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  添加 MCP Server
                </DrawerTitle>
                <DrawerDescription>
                  连接外部 MCP Server，列出其暴露的工具，按需勾选导入。导入后每个 MCP 工具会作为一条独立工具记录入库，可单独启停/下发。
                </DrawerDescription>
              </DrawerHeader>

              <div className="px-4 pb-4 space-y-4 overflow-y-auto">
                <div className="space-y-2">
                  <Label>Transport</Label>
                  <Select
                    value={mcpConfig.transport || 'http'}
                    onValueChange={(v: any) => setMcpConfig({ ...mcpConfig, transport: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">Streamable HTTP（推荐）</SelectItem>
                      <SelectItem value="sse">SSE</SelectItem>
                      <SelectItem value="stdio">stdio（本地子进程）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mcpConfig.transport === 'stdio' ? (
                  <div className="space-y-2">
                    <Label>启动命令</Label>
                    <Input
                      value={mcpCommandText}
                      onChange={(e) => setMcpCommandText(e.target.value)}
                      placeholder="npx -y @modelcontextprotocol/server-filesystem /tmp"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">空格分隔的命令与参数。镜像内需可执行该命令。</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Server URL</Label>
                    <Input
                      value={mcpConfig.url || ''}
                      onChange={(e) => setMcpConfig({ ...mcpConfig, url: e.target.value })}
                      placeholder={mcpConfig.transport === 'sse' ? 'https://mcp.example.com/sse' : 'https://mcp.example.com/mcp'}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">支持 ${'{ENV_VAR}'} 占位符。</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>认证</Label>
                    <Select
                      value={mcpConfig.auth?.type || 'none'}
                      onValueChange={(v: any) =>
                        setMcpConfig({ ...mcpConfig, auth: { ...(mcpConfig.auth || {}), type: v } })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无认证</SelectItem>
                        <SelectItem value="bearer_token">Bearer Token</SelectItem>
                        <SelectItem value="api_key">API Key</SelectItem>
                        <SelectItem value="basic">Basic Auth</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>超时（秒）</Label>
                    <Input
                      type="number"
                      min={1}
                      max={300}
                      value={mcpConfig.timeout ?? 30}
                      onChange={(e) =>
                        setMcpConfig({ ...mcpConfig, timeout: parseInt(e.target.value) || 30 })
                      }
                    />
                  </div>
                </div>

                {mcpConfig.auth?.type === 'bearer_token' && (
                  <Input
                    value={mcpConfig.auth.env_key || ''}
                    onChange={(e) =>
                      setMcpConfig({ ...mcpConfig, auth: { ...mcpConfig.auth!, env_key: e.target.value } })
                    }
                    placeholder="环境变量名，如 MCP_TOKEN"
                  />
                )}
                {mcpConfig.auth?.type === 'api_key' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={mcpConfig.auth.env_key || ''}
                      onChange={(e) =>
                        setMcpConfig({ ...mcpConfig, auth: { ...mcpConfig.auth!, env_key: e.target.value } })
                      }
                      placeholder="环境变量名"
                    />
                    <Input
                      value={mcpConfig.auth.header_name || 'X-Api-Key'}
                      onChange={(e) =>
                        setMcpConfig({ ...mcpConfig, auth: { ...mcpConfig.auth!, header_name: e.target.value } })
                      }
                      placeholder="请求头名称"
                    />
                  </div>
                )}
                {mcpConfig.auth?.type === 'basic' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={mcpConfig.auth.username_env || ''}
                      onChange={(e) =>
                        setMcpConfig({ ...mcpConfig, auth: { ...mcpConfig.auth!, username_env: e.target.value } })
                      }
                      placeholder="用户名环境变量"
                    />
                    <Input
                      value={mcpConfig.auth.password_env || ''}
                      onChange={(e) =>
                        setMcpConfig({ ...mcpConfig, auth: { ...mcpConfig.auth!, password_env: e.target.value } })
                      }
                      placeholder="密码环境变量"
                    />
                  </div>
                )}

                {mcpConfig.transport !== 'stdio' && (
                  <JsonEditor
                    label="额外请求头"
                    value={mcpHeadersText}
                    onChange={setMcpHeadersText}
                    rows={3}
                    placeholder='{"X-Tenant": "abc"}'
                  />
                )}

                <Button
                  onClick={handleMcpDiscover}
                  disabled={mcpDiscovering}
                  className="w-full"
                >
                  {mcpDiscovering ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                      连接中...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      连接并列出工具
                    </>
                  )}
                </Button>

                {mcpDiscoverError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{mcpDiscoverError}</span>
                  </div>
                )}

                {mcpDiscovered.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>选择要导入的工具（{mcpSelected.size}/{mcpDiscovered.length}）</Label>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMcpSelected(new Set(mcpDiscovered.map((t) => t.name)))}
                        >全选</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMcpSelected(new Set())}
                        >清空</Button>
                      </div>
                    </div>
                    <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
                      {mcpDiscovered.map((t) => (
                        <label
                          key={t.name}
                          className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={mcpSelected.has(t.name)}
                            onChange={() => toggleMcpSelected(t.name)}
                            className="h-4 w-4 mt-0.5 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm">{t.name}</div>
                            {t.description && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {t.description}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DrawerFooter>
                <Button
                  onClick={handleMcpImport}
                  disabled={mcpImporting || mcpSelected.size === 0}
                >
                  {mcpImporting ? '导入中...' : `导入选中的 ${mcpSelected.size} 个工具`}
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline">关闭</Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>

        <ConfirmDialog />
      </div>
    );
  }

  // Form view (Create/Edit) — v3 two-pane layout: form on the left,
  // AI assistant pinned to a 380px right sidebar (instead of the
  // legacy inline collapsible card).
  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        breadcrumb={
          viewMode === 'create'
            ? ['工作区', '工具', '新建']
            : ['工作区', '工具', formData.name || '编辑']
        }
        subtitle={viewMode === 'create' ? '新建工具' : '编辑模式'}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 px-2 text-[12px]">
              放弃
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openTestDrawer}
              className="h-7 gap-1.5 px-3 text-[12px]"
            >
              <Play className="h-3.5 w-3.5" />
              测试运行
            </Button>
            <Button size="sm" onClick={handleSave} className="h-7 gap-1.5 px-3 text-[12px]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {viewMode === 'create' ? '创建并保存' : '保存'}
            </Button>
          </>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Left pane — form body. Fills the entire flex-1 column;
            the right AI aside takes its own 380px so we don't need
            an additional inner cap. */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-7 pt-6 pb-12">
            {/* Meta row — icon tile + mono name + connection summary +
                approval pill. Replaces the generic PageTitle for this
                editor since the design wants a denser identity row. */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <Wrench className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[16px] font-semibold tracking-tight text-foreground">
                  {viewMode === 'create' ? '新建工具' : (formData.name || '编辑工具')}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {viewMode === 'create'
                    ? '描述好你的 API，右侧 AI 助手可以从 cURL / 文档自动填表，也可以手动配置。'
                    : (() => {
                        const type = formData.execution?.type === 'mcp' ? 'MCP' : 'HTTP';
                        const method = formData.execution?.config?.method?.toUpperCase() || '';
                        const source = formData.source === 'admin_assigned' ? '全局工具' : '私有工具';
                        return [type, method, source].filter(Boolean).join(' · ');
                      })()}
                </div>
              </div>
              {viewMode === 'edit' && formData.requires_approval && (
                <Pill tone="warning" dot>需审批</Pill>
              )}
            </div>

      <div>
        {/* Section 1: Basic Info — 12-col grid w/ Field atoms */}
        <H2 first>基础信息</H2>
        <p className="-mt-2 mb-4 text-[11.5px] text-muted-foreground">
          工具名称用于代码调用，只能包含字母、数字和下划线。调用指南会帮助 AI 理解何时使用这个工具。
        </p>
        <div className="grid grid-cols-12 gap-3.5">
          <Field
            label={
              <span className="flex items-center gap-2">
                工具名 (name)
                {viewMode === 'edit' && (
                  <span className="text-[10px] font-normal text-chart-4">🔒 不可修改</span>
                )}
              </span>
            }
            span={6}
            required
            hint={
              viewMode === 'edit'
                ? '工具名称是唯一标识符，创建后不可修改'
                : 'snake_case，将作为模型调用时的 tool_call name'
            }
          >
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={viewMode === 'edit'}
              placeholder="例如: web_search"
              className={cn(
                'h-8 font-mono text-[12.5px]',
                viewMode === 'edit' && 'cursor-not-allowed',
              )}
            />
          </Field>

          <Field label="显示名" span={6} required>
            <Input
              value={formData.display_name || ''}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="例如: 网络搜索"
              className="h-8 text-[12.5px]"
            />
          </Field>

          <Field
            label="描述（给模型看）"
            span={12}
            required
            hint="清晰描述这个工具的用途、何时该调用、不该调用的场景。模型会基于此判断是否使用。"
          >
            <Textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="工具的详细描述，说明它的功能和用途"
              rows={3}
              className="text-[12.5px]"
            />
          </Field>

          <Field
            label="调用指南"
            span={12}
            hint="给 AI 看的「何时该用 / 不该用」提示，帮助模型更精准地选择工具。"
          >
            <Textarea
              value={formData.calling_guide || ''}
              onChange={(e) => setFormData({ ...formData, calling_guide: e.target.value })}
              placeholder="例如：适用于查询实时天气信息，需要提供城市名称"
              rows={3}
              className="text-[12.5px]"
            />
          </Field>

          <div className="col-span-12 flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <label className="flex items-center gap-2 text-[12.5px] text-foreground">
              <input
                type="checkbox"
                checked={formData.requires_approval || false}
                onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                className="h-3.5 w-3.5 rounded"
              />
              调用前需要审批
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-foreground">
              <input
                type="checkbox"
                checked={formData.enabled !== false}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="h-3.5 w-3.5 rounded"
              />
              启用此工具
            </label>
          </div>
        </div>

        {/* Section 2: Execution Config */}
        {formData.execution?.type === 'mcp' ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                MCP 执行配置
              </CardTitle>
              <CardDescription>
                此工具来自 MCP Server，参数定义和调用配置由 server 决定。如需调整 server 连接信息，请删除该工具后从 MCP Server 重新导入。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Transport</Label>
                  <div className="font-mono mt-1">{formData.execution?.mcp?.transport || 'http'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tool name</Label>
                  <div className="font-mono mt-1">{formData.execution?.mcp?.tool_name || '-'}</div>
                </div>
              </div>
              {formData.execution?.mcp?.url && (
                <div>
                  <Label className="text-xs text-muted-foreground">Server URL</Label>
                  <div className="font-mono mt-1 break-all">{formData.execution.mcp.url}</div>
                </div>
              )}
              {formData.execution?.mcp?.command && formData.execution.mcp.command.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Command</Label>
                  <div className="font-mono mt-1 break-all">{formData.execution.mcp.command.join(' ')}</div>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Auth</Label>
                <div className="font-mono mt-1">
                  {formData.execution?.mcp?.auth?.type || 'none'}
                  {formData.execution?.mcp?.auth?.env_key ? ` (${formData.execution.mcp.auth.env_key})` : ''}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
        <>
        <H2>执行配置</H2>
        <div className="-mt-2 mb-4 space-y-2 text-[11.5px] text-muted-foreground">
          <div className="flex items-start gap-2">
            <Link2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>配置外部 API 的端点、认证方式和数据映射。所有配置支持动态占位符替换。</span>
          </div>
          <details className="ml-5">
            <summary className="cursor-pointer text-foreground/80 hover:text-foreground">查看占位符语法</summary>
            <div className="mt-1 space-y-1">
              <div>1️⃣ <strong>环境变量</strong> - 使用 <code className="bg-muted px-1 py-0.5 rounded">$&#123;变量名&#125;</code></div>
              <div className="pl-6">示例：<code className="bg-muted px-1 py-0.5 rounded">$&#123;API_KEY&#125;</code></div>
              <div>2️⃣ <strong>用户信息</strong> - 使用 <code className="bg-muted px-1 py-0.5 rounded">$&#123;user.字段名&#125;</code></div>
              <div className="pl-6">可用字段：id, username, name, email, role_level</div>
              <div>3️⃣ <strong>输入参数</strong> - 使用 <code className="bg-muted px-1 py-0.5 rounded">&#123;&#123;参数名&#125;&#125;</code></div>
              <div className="pl-6">示例：<code className="bg-muted px-1 py-0.5 rounded">https://api.com/users/&#123;&#123;user_id&#125;&#125;/posts</code></div>
            </div>
          </details>
        </div>
        <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="endpoint">API端点 *</Label>
              <Input
                id="endpoint"
                value={formData.execution?.config?.endpoint || ''}
                onChange={(e) => updateExecution('config.endpoint', e.target.value)}
                placeholder="https://api.example.com/v1/search/{{query}}"
              />
              <p className="text-sm text-muted-foreground">
                支持环境变量：$&#123;API_BASE_URL&#125;/endpoint<br />
                支持参数引用：/api/users/&#123;&#123;user_id&#125;&#125;<br />
                支持用户信息：/user/$&#123;user.id&#125;/data
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="method">HTTP方法 *</Label>
                <Select
                  value={formData.execution?.config?.method || 'POST'}
                  onValueChange={(value) => updateExecution('config.method', value)}
                >
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET - 查询数据</SelectItem>
                    <SelectItem value="POST">POST - 创建数据</SelectItem>
                    <SelectItem value="PUT">PUT - 完整更新</SelectItem>
                    <SelectItem value="DELETE">DELETE - 删除数据</SelectItem>
                    <SelectItem value="PATCH">PATCH - 部分更新</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">超时时间 (秒)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={formData.execution?.config?.timeout || 10}
                  onChange={(e) => updateExecution('config.timeout', parseInt(e.target.value))}
                  min="1"
                  max="60"
                />
                <p className="text-sm text-muted-foreground">推荐值：快速API 5-10秒</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">重试配置</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  当API请求失败时，系统会自动重试。默认重试3次，每次间隔1秒。会触发重试的情况：网络错误、HTTP 5xx错误、HTTP 429错误。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="retry_max">重试次数</Label>
                  <Input
                    id="retry_max"
                    type="number"
                    value={formData.execution?.config?.retry?.max_attempts ?? 3}
                    onChange={(e) => updateExecution('config.retry.max_attempts', parseInt(e.target.value))}
                    min="0"
                    max="10"
                  />
                  <p className="text-sm text-muted-foreground">默认3次，0表示不重试</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retry_backoff">重试间隔 (毫秒)</Label>
                  <Input
                    id="retry_backoff"
                    type="number"
                    value={formData.execution?.config?.retry?.backoff_ms || 1000}
                    onChange={(e) => updateExecution('config.retry.backoff_ms', parseInt(e.target.value))}
                    min="100"
                    max="10000"
                    step="100"
                  />
                  <p className="text-sm text-muted-foreground">默认1000ms (1秒)</p>
                </div>
              </div>
            </div>

            <Separator />

            <JsonEditor
              id="headers"
              label="请求头 (Headers)"
              value={headersText}
              onChange={(v) => { setHeadersText(v); setHeadersError(''); }}
              onBlur={(parsed) => updateExecution('config.headers', parsed)}
              error={headersError}
              rows={5}
              placeholder={'{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer ${MY_TOKEN}"\n}'}
              description={
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• <code className="bg-muted px-1 rounded">$&#123;ENV_VAR&#125;</code> 环境变量 · <code className="bg-muted px-1 rounded">$&#123;user.id&#125;</code> 用户信息 · <code className="bg-muted px-1 rounded">&#123;&#123;param&#125;&#125;</code> 输入参数</div>
                </div>
              }
            />

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">认证配置</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  密钥从 .env 文件的环境变量中读取，请勿直接填写密钥明文。
                </p>
              </div>

              <div className="space-y-4">
                <Select
                  value={formData.execution?.config?.auth?.type || 'none'}
                  onValueChange={(value) => updateExecution('config.auth.type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无认证</SelectItem>
                    <SelectItem value="bearer_token">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                  </SelectContent>
                </Select>

                {formData.execution?.config?.auth?.type === 'bearer_token' && (
                  <div className="space-y-3">
                    <Input
                      value={formData.execution?.config?.auth?.env_key || ''}
                      onChange={(e) => updateExecution('config.auth.env_key', e.target.value)}
                      placeholder="环境变量名，如 MY_BEARER_TOKEN"
                    />
                    <div className="bg-muted p-3 rounded-md text-xs space-y-1">
                      <div className="font-medium mb-1">示例：</div>
                      <div>.env 文件中添加：<code>MY_BEARER_TOKEN=eyJhbGciOiJIUzI1NiIs...</code></div>
                      <div>系统会自动在请求头中添加：<code>Authorization: Bearer eyJhbGci...</code></div>
                    </div>
                  </div>
                )}

                {formData.execution?.config?.auth?.type === 'api_key' && (
                  <div className="space-y-3">
                    <Input
                      value={formData.execution?.config?.auth?.env_key || ''}
                      onChange={(e) => updateExecution('config.auth.env_key', e.target.value)}
                      placeholder="环境变量名，如 MY_API_KEY"
                    />
                    <Input
                      value={formData.execution?.config?.auth?.header_name || 'X-Api-Key'}
                      onChange={(e) => updateExecution('config.auth.header_name', e.target.value)}
                      placeholder="请求头名称，如 X-Api-Key"
                    />
                    <div className="bg-muted p-3 rounded-md text-xs space-y-1">
                      <div className="font-medium mb-1">示例：</div>
                      <div>.env 文件：<code>MY_API_KEY=sk-abc123def456</code></div>
                      <div>请求头名称：<code>X-Api-Key</code></div>
                      <div>系统发送：<code>X-Api-Key: sk-abc123def456</code></div>
                    </div>
                  </div>
                )}

                {formData.execution?.config?.auth?.type === 'basic' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={formData.execution?.config?.auth?.username_env || ''}
                        onChange={(e) => updateExecution('config.auth.username_env', e.target.value)}
                        placeholder="用户名环境变量，如 BASIC_USER"
                      />
                      <Input
                        value={formData.execution?.config?.auth?.password_env || ''}
                        onChange={(e) => updateExecution('config.auth.password_env', e.target.value)}
                        placeholder="密码环境变量，如 BASIC_PASS"
                      />
                    </div>
                    <div className="bg-muted p-3 rounded-md text-xs space-y-1">
                      <div className="font-medium mb-1">示例：</div>
                      <div>.env 文件：<code>BASIC_USER=admin</code> 和 <code>BASIC_PASS=secret123</code></div>
                      <div>系统发送：<code>Authorization: Basic YWRtaW46c2VjcmV0MTIz</code> (自动 Base64 编码)</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <JsonEditor
              id="request_mapping"
              label="请求映射 (Request Mapping)"
              value={requestMappingText}
              onChange={(v) => { setRequestMappingText(v); setRequestMappingError(''); }}
              onBlur={(parsed) => updateExecution('request_mapping', parsed)}
              error={requestMappingError}
              rows={7}
              placeholder={'{\n  "query": "{{query}}",\n  "limit": "{{limit | default: 10}}"\n}'}
              description={
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• <code className="bg-muted px-1 rounded">&#123;&#123;param&#125;&#125;</code> 引用参数 · <code className="bg-muted px-1 rounded">&#123;&#123;p | default: 10&#125;&#125;</code> 带默认值 · <code className="bg-muted px-1 rounded">$&#123;user.id&#125;</code> 用户信息 · <code className="bg-muted px-1 rounded">$&#123;ENV&#125;</code> 环境变量</div>
                  {formData.execution?.config?.method === 'GET' && (
                    <div className="font-medium">GET 请求时参数作为 URL 查询参数发送</div>
                  )}
                </div>
              }
            />

            <JsonEditor
              id="response_mapping"
              label="响应映射 (Response Mapping)"
              value={responseMappingText}
              onChange={(v) => { setResponseMappingText(v); setResponseMappingError(''); }}
              onBlur={(parsed) => updateExecution('response_mapping', parsed)}
              error={responseMappingError}
              rows={7}
              placeholder={'{\n  "root_path": "data",\n  "field_mapping": {\n    "title": "name"\n  }\n}'}
              description={
                <div className="text-xs text-muted-foreground space-y-1">
                  <div><code className="bg-muted px-1 rounded">root_path</code>: 数据路径（如 <code className="bg-muted px-1 rounded">"data"</code>、<code className="bg-muted px-1 rounded">"result.items"</code>，留空取顶层）</div>
                  <div><code className="bg-muted px-1 rounded">field_mapping</code>: 字段重命名，<code className="bg-muted px-1 rounded">||</code> 表示备选字段</div>
                </div>
              }
            />

            <Separator />

            {/* Polling Configuration */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-semibold">异步轮询配置</h4>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="polling_enabled"
                      checked={formData.execution?.polling?.enabled || false}
                      onChange={(e) => updateExecution('polling.enabled', e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <Label htmlFor="polling_enabled" className="font-normal">启用</Label>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  适用于异步 API（视频生成、图片生成等）：先提交任务获取 task_id，再轮询状态接口直到完成。
                  启用后工具会自动处理轮询，对 AI 来说仍是一次调用。
                </p>
              </div>

              {formData.execution?.polling?.enabled && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label>状态查询端点 *</Label>
                      <Input
                        value={formData.execution?.polling?.status_endpoint || ''}
                        onChange={(e) => updateExecution('polling.status_endpoint', e.target.value)}
                        placeholder="https://api.example.com/status/{{task_id}}"
                      />
                      <p className="text-sm text-muted-foreground">使用 {'{{task_id}}'} 引用任务ID</p>
                    </div>
                    <div className="space-y-2">
                      <Label>任务ID路径</Label>
                      <Input
                        value={formData.execution?.polling?.task_id_path || 'task_id'}
                        onChange={(e) => updateExecution('polling.task_id_path', e.target.value)}
                        placeholder="task_id"
                      />
                      <p className="text-sm text-muted-foreground">提交接口返回的 JSON 中 task_id 的路径，如 <code className="bg-muted px-1 rounded">data.task_id</code></p>
                    </div>
                    <div className="space-y-2">
                      <Label>状态字段路径</Label>
                      <Input
                        value={formData.execution?.polling?.status_field || 'status'}
                        onChange={(e) => updateExecution('polling.status_field', e.target.value)}
                        placeholder="status"
                      />
                      <p className="text-sm text-muted-foreground">轮询返回的 JSON 中状态字段路径</p>
                    </div>
                    <div className="space-y-2">
                      <Label>完成状态值</Label>
                      <Input
                        value={formData.execution?.polling?.completed_value || 'completed'}
                        onChange={(e) => updateExecution('polling.completed_value', e.target.value)}
                        placeholder="completed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>失败状态值</Label>
                      <Input
                        value={formData.execution?.polling?.failed_value || 'failed'}
                        onChange={(e) => updateExecution('polling.failed_value', e.target.value)}
                        placeholder="failed"
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>结果数据路径</Label>
                      <Input
                        value={formData.execution?.polling?.result_path || ''}
                        onChange={(e) => updateExecution('polling.result_path', e.target.value)}
                        placeholder="data.result"
                      />
                      <p className="text-sm text-muted-foreground">轮询完成后，从返回 JSON 中提取最终结果的路径。留空则使用整个响应。</p>
                    </div>
                    <div className="space-y-2">
                      <Label>轮询间隔 (秒)</Label>
                      <Input
                        type="number"
                        value={formData.execution?.polling?.interval_seconds || 5}
                        onChange={(e) => updateExecution('polling.interval_seconds', parseInt(e.target.value))}
                        min="1" max="60"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>最大轮询次数</Label>
                      <Input
                        type="number"
                        value={formData.execution?.polling?.max_attempts || 60}
                        onChange={(e) => updateExecution('polling.max_attempts', parseInt(e.target.value))}
                        min="1" max="600"
                      />
                      <p className="text-sm text-muted-foreground">
                        最长等待 {(formData.execution?.polling?.interval_seconds || 5) * (formData.execution?.polling?.max_attempts || 60)} 秒
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <Button variant="outline" className="w-full" onClick={openTestDrawer}>
              <Search className="w-4 h-4 mr-2" />
              测试连通性
            </Button>
            <Drawer open={testDrawerOpen} onOpenChange={setTestDrawerOpen}>
              <DrawerContent>
                <div className="mx-auto w-full max-w-6xl">
                  <DrawerHeader>
                    <DrawerTitle>测试连通性</DrawerTitle>
                    <DrawerDescription>使用当前配置发送测试请求</DrawerDescription>
                  </DrawerHeader>
                  <div className="px-4 pb-4 space-y-4">
                    {/* Editable endpoint */}
                    <div className="flex gap-2">
                      <Select value={testMethod} onValueChange={setTestMethod}>
                        <SelectTrigger className="w-28 h-9 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                          <SelectItem value="PATCH">PATCH</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={testEndpoint}
                        onChange={(e) => setTestEndpoint(e.target.value)}
                        placeholder="https://api.example.com/endpoint"
                        className="h-9 font-mono text-sm"
                      />
                    </div>
                    <JsonEditor
                      label="请求参数"
                      value={testParamsText}
                      onChange={setTestParamsText}
                      rows={8}
                      placeholder={'{\n  "body": {\n    "model": "xxx",\n    "prompt": "test"\n  }\n}'}
                      description={
                        <p className="text-xs text-muted-foreground">
                          已从请求映射预填默认值，支持嵌套对象和数组。直接编辑左侧 JSON 或在右侧树中查看结构。
                        </p>
                      }
                    />

                    {/* Result */}
                    {testResult && (
                      <div className={`p-4 rounded-md border space-y-2 ${testResult.ok ? 'text-chart-2 border-chart-2/30' : 'text-chart-5 border-chart-5/30'}`}>
                        <div className="font-medium flex items-center gap-2">
                          {testResult.ok ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                          {testResult.message}
                        </div>
                        {testResult.latency_ms > 0 && (
                          <div className="text-sm text-muted-foreground">响应时间: {testResult.latency_ms}ms</div>
                        )}
                        {testResult.data && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">查看响应数据</summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-foreground overflow-auto max-h-48">
                              {JSON.stringify(testResult.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                  <DrawerFooter>
                    <Button onClick={handleTest} disabled={isTesting || !testEndpoint}>
                      {isTesting ? '测试中...' : <><Search className="w-4 h-4 mr-2" />发送测试请求</>}
                    </Button>
                    <DrawerClose asChild>
                      <Button variant="outline">关闭</Button>
                    </DrawerClose>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
        </div>
        </>
        )}

        {/* Section 3: Parameters & Output Schema */}
        <H2>参数与返回值</H2>
        <p className="-mt-2 mb-4 flex items-start gap-2 text-[11.5px] text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>定义工具的输入参数和输出结构。参数会被 AI 自动识别和填充，输出结构帮助 AI 理解返回的数据格式。</span>
        </p>
        <div className="space-y-8">
            {/* Input Parameters */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">输入参数</h4>
                <Button onClick={addParameter} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  添加参数
                </Button>
              </div>

              {formData.input_schema?.parameters && formData.input_schema.parameters.length > 0 ? (
                <div className="space-y-3">
                  {formData.input_schema.parameters.map((param, index) => (
                    <Card key={index}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex gap-2 items-center">
                          <Input
                            value={param.name}
                            onChange={(e) => updateParameter(index, 'name', e.target.value)}
                            placeholder="参数名"
                            className="flex-1"
                          />
                          <Select
                            value={param.type}
                            onValueChange={(value) => updateParameter(index, 'type', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">string</SelectItem>
                              <SelectItem value="integer">integer</SelectItem>
                              <SelectItem value="number">number</SelectItem>
                              <SelectItem value="boolean">boolean</SelectItem>
                              <SelectItem value="array">array</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`param-required-${index}`}
                              checked={param.required}
                              onChange={(e) => updateParameter(index, 'required', e.target.checked)}
                              className="h-4 w-4 rounded"
                            />
                            <Label htmlFor={`param-required-${index}`} className="font-normal text-sm">必填</Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeParameter(index)}
                            title="删除"
                          >
                            ×
                          </Button>
                        </div>
                        <Textarea
                          value={param.description}
                          onChange={(e) => updateParameter(index, 'description', e.target.value)}
                          placeholder="参数描述"
                          rows={2}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">暂无参数，点击"添加参数"创建</div>
              )}
            </div>

            <Separator />

            {/* Output Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">输出字段</h4>
                <Button onClick={addOutputField} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  添加字段
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="output_type">返回类型</Label>
                <Select
                  value={formData.output_schema?.type || 'list'}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      output_schema: { ...formData.output_schema, type: value } as any,
                    })
                  }
                >
                  <SelectTrigger id="output_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">列表 (list)</SelectItem>
                    <SelectItem value="object">对象 (object)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.output_schema?.item_fields && formData.output_schema.item_fields.length > 0 ? (
                <div className="space-y-3">
                  {formData.output_schema.item_fields.map((field, index) => (
                    <Card key={index}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex gap-2 items-center">
                          <Input
                            value={field.name}
                            onChange={(e) => updateOutputField(index, 'name', e.target.value)}
                            placeholder="字段名"
                            className="flex-1"
                          />
                          <Select
                            value={field.type}
                            onValueChange={(value) => updateOutputField(index, 'type', value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">string</SelectItem>
                              <SelectItem value="integer">integer</SelectItem>
                              <SelectItem value="number">number</SelectItem>
                              <SelectItem value="boolean">boolean</SelectItem>
                              <SelectItem value="array">array</SelectItem>
                              <SelectItem value="object">object</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOutputField(index)}
                            title="删除"
                          >
                            ×
                          </Button>
                        </div>
                        <Textarea
                          value={field.description}
                          onChange={(e) => updateOutputField(index, 'description', e.target.value)}
                          placeholder="字段描述"
                          rows={2}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">暂无字段，点击"添加字段"创建</div>
              )}
            </div>
        </div>
      </div>
          </div>
        </div>

        {/* Right pane — AI assistant. Replaces the legacy inline
            collapsible card. The existing handleAIGenerate /
            aiDescription / aiLoading state is wired in unchanged so
            existing parsing logic still applies. */}
        <aside className="hidden w-[380px] flex-shrink-0 flex-col border-l border-border bg-muted/30 md:flex">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <Sparkles className="h-3.5 w-3.5 text-foreground" />
            <span className="text-[12.5px] font-semibold text-foreground">AI 配置助手</span>
            <Pill tone="info" className="ml-auto">BETA</Pill>
          </header>

          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
            {/* Intro — what the helper actually does, not a generic chat. */}
            <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
              贴 <strong>cURL</strong>、<strong>OpenAPI 片段</strong> 或一段中文描述。我会一次性填好<strong>端点 / 方法 / 鉴权 / 参数 schema / 响应映射</strong>，左侧表单立即更新，你审一遍就能保存。
            </div>

            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              示例模板（点击填入）
            </div>

            <div className="flex flex-col gap-2">
              {(
                viewMode === 'create'
                  ? [
                      {
                        label: '从 cURL 一键生成',
                        sub: '复制实际的 curl 命令，AI 解析 method / URL / headers / body',
                        seed:
                          "curl -X POST 'https://erp.example.com/api/v2/refunds' \\\n" +
                          "  -H 'Authorization: Bearer ${ERP_API_TOKEN}' \\\n" +
                          "  -H 'Content-Type: application/json' \\\n" +
                          "  -d '{\n" +
                          '    "order_id": "ord_8821",\n' +
                          '    "amount": 1280,\n' +
                          '    "reason": "商品质量问题"\n' +
                          "  }'",
                      },
                      {
                        label: '从 API 文档片段',
                        sub: '粘贴接口文档的请求 / 响应说明，AI 抽出参数表',
                        seed:
                          'POST /api/v2/refunds — 创建退款单\n\n' +
                          '请求体 (JSON)：\n' +
                          '  order_id  string   必填  订单号，必须以 ord_ 开头\n' +
                          '  amount    number   必填  退款金额，单位元\n' +
                          '  reason    string   可选  退款原因，会写入审计日志\n\n' +
                          '响应：\n' +
                          '  refund_id  string  退款单 ID\n' +
                          '  status     string  pending | processing | done\n\n' +
                          '鉴权：Bearer Token，env=ERP_API_TOKEN',
                      },
                      {
                        label: '用中文描述',
                        sub: '直接说人话，AI 自己推断字段类型 / 必填 / 默认值',
                        seed:
                          '需要一个查询用户订单的工具。调用 https://erp.example.com/api/v2/users/{user_id}/orders（GET）。' +
                          'user_id 必填走路径，days 可选走 query（默认 7，最大 90）。' +
                          '鉴权用 ${ERP_API_TOKEN} 的 Bearer Token。响应是 orders 数组，每条含 id / amount / status 三个字段。',
                      },
                    ]
                  : [
                      {
                        label: '增加一个参数',
                        sub: '描述新字段，AI 把它合并进现有 input_schema',
                        seed:
                          '在现有参数基础上加一个 limit 字段：integer 类型，最大 100，默认 20，描述"返回结果的最大条数"。',
                      },
                      {
                        label: '修改鉴权方式',
                        sub: 'AI 重写 execution.config 里的 auth 部分',
                        seed:
                          '把鉴权从当前方式改成 Bearer Token，token 走环境变量 ${ERP_API_TOKEN}。其他字段保持不变。',
                      },
                      {
                        label: '补全参数描述',
                        sub: 'AI 给每个 input/output 字段补一段给模型看的说明',
                        seed:
                          '当前每个参数的描述太简单，请基于工具用途补全，强调"何时该传、不传时的行为、取值范围或格式约束"。',
                      },
                      {
                        label: '换一个端点',
                        sub: '描述新端点，AI 调整 URL / method / 参数映射',
                        seed:
                          '把端点从当前的 v2 切到 v3：URL 改成 https://erp.example.com/api/v3/refunds，method 不变，新增一个必填的 idempotency_key（string）走 header。',
                      },
                    ]
              ).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAiDescription(s.seed)}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <Sparkles className="h-3 w-3 text-muted-foreground" />
                    {s.label}
                  </span>
                  <span className="pl-[18px] text-[11px] leading-snug text-muted-foreground">
                    {s.sub}
                  </span>
                </button>
              ))}
            </div>

            {aiError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{aiError}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border p-3">
            <Textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder={
                viewMode === 'create'
                  ? '贴 cURL / 文档片段，或描述这个 API 该怎么调用…'
                  : '描述要改的地方，例如：把鉴权改成 Bearer Token，token 走 env'
              }
              rows={3}
              disabled={aiLoading}
              className="min-h-[68px] resize-none bg-background font-mono text-[12px] leading-relaxed"
            />
            <div className="flex items-center gap-2">
              <Pill tone="outline" mono>
                {viewMode === 'create' ? '从描述生成' : '在现有配置上修改'}
              </Pill>
              <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
                {aiLoading ? '解析中…' : `${aiDescription.length} 字`}
              </span>
              <Button
                size="sm"
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiDescription.trim()}
                className="h-7 gap-1 px-2.5 text-[12px]"
              >
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {aiLoading ? '解析中' : (viewMode === 'create' ? '生成配置' : '应用修改')}
              </Button>
            </div>
            <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              {viewMode === 'create'
                ? '生成后会立即填到左侧表单；你可以再手动调整。'
                : '会保留工具名 / 启用状态等元数据，只改你描述的部分。'}
            </p>
          </div>
        </aside>
      </div>
      <ConfirmDialog />
    </div>
  );
};
