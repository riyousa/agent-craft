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
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';

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
              共 {tools.length} 个工具
            </p>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time-desc">最新优先</SelectItem>
                <SelectItem value="time-asc">最早优先</SelectItem>
                <SelectItem value="name">按名称</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openMcpDrawer}>
              <Server className="w-4 h-4 mr-2" />
              添加 MCP Server
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              创建工具
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Wrench className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">暂无工具</h3>
                <p className="text-muted-foreground mb-4">点击"创建工具"按钮添加您的第一个API工具</p>
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建工具
                </Button>
              </CardContent>
            </Card>
          ) : (
            sortedTools.map((tool) => (
              <Card
                key={tool.id}
                className={`flex flex-col transition-all hover:shadow-md ${!tool.enabled ? 'opacity-60' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tool.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{tool.display_name}</CardTitle>
                        <code className="text-xs text-muted-foreground">{tool.name}</code>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="mt-2 line-clamp-2">{tool.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pb-3">
                  <div className="flex gap-2 flex-wrap mb-3">
                    <Badge variant={tool.source === 'user_created' ? 'default' : 'secondary'}>
                      {tool.source === 'user_created' ? '自建' : '系统'}
                    </Badge>
                    {tool.execution?.type === 'mcp' ? (
                      <Badge variant="outline" className="border-primary/50 text-primary">
                        <Server className="w-3 h-3 mr-1" /> MCP
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {tool.execution?.config?.method || 'POST'}
                      </Badge>
                    )}
                    {!tool.enabled && <Badge variant="outline">已停用</Badge>}
                    {tool.requires_approval && (
                      <Badge variant="outline" className="border-chart-4/50 text-chart-4">
                        需审批
                      </Badge>
                    )}
                  </div>
                  {tool.execution?.type === 'mcp' ? (
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      {tool.execution.mcp?.url || (tool.execution.mcp?.command || []).join(' ') || ''}
                      {tool.execution.mcp?.tool_name ? ` · ${tool.execution.mcp.tool_name}` : ''}
                    </p>
                  ) : (
                    tool.execution?.config?.endpoint && (
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {tool.execution.config.endpoint}
                      </p>
                    )
                  )}
                </CardContent>
                <Separator />
                <div className="flex items-center justify-end gap-1 p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleEnabled(tool)}
                  >
                    {tool.enabled ? <Pause className="w-4 h-4 mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
                    {tool.enabled ? '停用' : '启用'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(tool)}
                  >
                    <Edit2 className="w-4 h-4 mr-1.5" />
                    编辑
                  </Button>
                  {(isAdminMode || tool.source === 'user_created') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tool)}
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

  // Form view (Create/Edit)
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            ← 返回
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">
            {viewMode === 'create' ? '创建新工具' : `编辑 · ${formData.display_name || formData.name}`}
          </span>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleCancel}>取消</Button>
          <Button onClick={handleSave}>{viewMode === 'create' ? '创建' : '保存'}</Button>
        </div>
      </div>

      {/* AI Assistant Section */}
      <Collapsible defaultOpen={false} className="mb-8">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <span>AI配置助手</span>
                </CardTitle>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
              </div>
              <CardDescription>
                {viewMode === 'create'
                  ? '描述您的API，AI将自动填充下方配置'
                  : '描述新的API配置需求，AI将帮助您优化工具配置'}
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <Textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder={viewMode === 'create'
                  ? "例如：我需要调用天气查询API。端点是 https://api.weather.com/v1/weather，使用GET方法。需要传入city参数（城市名）。认证方式是在请求头添加X-API-Key，密钥在环境变量WEATHER_API_KEY中。返回的JSON中，天气信息在data.weather对象下，包含temperature、humidity、description字段。"
                  : "例如：修改端点为新版本v2，增加timeout参数，将认证方式改为Bearer Token"
                }
                rows={4}
                disabled={aiLoading}
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
                  disabled={aiLoading || !aiDescription.trim()}
                  className="flex-1"
                >
                  {aiLoading ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2"></span>
                      AI生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      {viewMode === 'create' ? '自动生成配置' : 'AI 优化配置'}
                    </>
                  )}
                </Button>
              </div>
              {viewMode === 'edit' && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" />
                  提示：AI将在保留工具名称的基础上更新其他配置
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div className="space-y-8">
        {/* Section 1: Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>工具名称用于代码调用，只能包含字母、数字和下划线。调用指南会帮助AI理解何时使用这个工具。</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                工具名称 (name) *
                {viewMode === 'edit' && (
                  <span className="text-xs font-normal text-chart-4">
                    🔒 编辑时不可修改
                  </span>
                )}
              </Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={viewMode === 'edit'}
                placeholder="例如: web_search"
                className={viewMode === 'edit' ? 'cursor-not-allowed' : ''}
              />
              <p className="text-sm text-muted-foreground">
                {viewMode === 'edit'
                  ? '工具名称是唯一标识符，创建后不可修改'
                  : '用于代码调用的唯一标识符，只能包含字母、数字和下划线'
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">显示名称 *</Label>
              <Input
                id="display_name"
                value={formData.display_name || ''}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="例如: 网络搜索"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述 *</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="工具的详细描述，说明它的功能和用途"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calling_guide">调用指南</Label>
              <Textarea
                id="calling_guide"
                value={formData.calling_guide || ''}
                onChange={(e) => setFormData({ ...formData, calling_guide: e.target.value })}
                placeholder="帮助AI理解何时以及如何使用这个工具。例如：适用于查询实时天气信息，需要提供城市名称"
                rows={3}
              />
              <p className="text-sm text-muted-foreground">这段文字会帮助AI更好地理解和使用工具</p>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="requires_approval"
                  checked={formData.requires_approval || false}
                  onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <Label htmlFor="requires_approval" className="font-normal">调用前需要审批</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled !== false}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <Label htmlFor="enabled" className="font-normal">启用此工具</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Execution Config */}
        {formData.execution?.type === 'mcp' ? (
          <Card>
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
        <Card>
          <CardHeader>
            <CardTitle>执行配置</CardTitle>
            <CardDescription className="space-y-2">
              <div className="flex items-start gap-2">
                <Link2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>配置外部API的端点、认证方式和数据映射。所有配置支持动态占位符替换。</span>
              </div>
              <div className="text-xs mt-3 space-y-1">
                <div><strong>占位符语法：</strong></div>
                <div>1️⃣ <strong>环境变量</strong> - 使用 <code className="bg-muted px-1 py-0.5 rounded">$&#123;变量名&#125;</code></div>
                <div className="pl-6">• 示例：<code className="bg-muted px-1 py-0.5 rounded">$&#123;API_KEY&#125;</code></div>
                <div>2️⃣ <strong>用户信息</strong> - 使用 <code className="bg-muted px-1 py-0.5 rounded">$&#123;user.字段名&#125;</code></div>
                <div className="pl-6">• 可用字段：id, username, name, email, role_level</div>
                <div>3️⃣ <strong>输入参数</strong> - 使用 <code className="bg-muted px-1 py-0.5 rounded">&#123;&#123;参数名&#125;&#125;</code></div>
                <div className="pl-6">• 示例：<code className="bg-muted px-1 py-0.5 rounded">https://api.com/users/&#123;&#123;user_id&#125;&#125;/posts</code></div>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
          </CardContent>
        </Card>
        )}

        {/* Section 3: Parameters & Output Schema */}
        <Card>
          <CardHeader>
            <CardTitle>参数与返回值</CardTitle>
            <CardDescription className="flex items-start gap-2">
              <ClipboardList className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>定义工具的输入参数和输出结构。参数会被AI自动识别和填充，输出结构帮助AI理解返回的数据格式。</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
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
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog />
    </div>
  );
};
