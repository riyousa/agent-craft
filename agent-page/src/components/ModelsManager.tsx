import React, { useEffect, useMemo, useState } from 'react';
import {
  AdminLLMModel,
  LLMModelInput,
  LLMProviderInfo,
  adminModelsApi,
} from '../api/user';
import {
  Plus,
  Pause,
  Play,
  Edit2,
  Trash2,
  Sparkles,
  Star,
  Eye,
  EyeOff,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Brain,
  Paperclip,
  KeyRound,
  ExternalLink,
  Info,
  Copy,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { JsonEditor } from './ui/json-editor';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription,
  DrawerFooter, DrawerHeader, DrawerTitle,
} from './ui/drawer';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/confirm-dialog';

const EMPTY_INPUT: LLMModelInput = {
  name: '',
  display_name: '',
  description: '',
  provider: 'openai',
  model: '',
  api_key: '',
  base_url: '',
  // 默认空对象 — provider 自身的默认 (temperature=0.7, 不限 max_tokens 等)
  // 已经够用；admin 想覆盖再填字段。avoid 默认就写一个 max_tokens 把回复
  // 截断的坑。
  extra_config: {},
  enabled: true,
  visible_to_users: true,
  is_default: false,
  sort_order: 0,
};

export const ModelsManager: React.FC = () => {
  const { toast } = useToast();
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const [models, setModels] = useState<AdminLLMModel[]>([]);
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminLLMModel | null>(null);
  const [form, setForm] = useState<LLMModelInput>({ ...EMPTY_INPUT });
  const [extraConfigText, setExtraConfigText] = useState('{}');
  const [extraConfigError, setExtraConfigError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; message: string; latency_ms: number; reply?: string } | null>(null);

  const providerSpec = useMemo(
    () => providers.find((p) => p.key === form.provider),
    [providers, form.provider]
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [list, provs] = await Promise.all([
        adminModelsApi.list(),
        adminModelsApi.listProviders(),
      ]);
      setModels(list);
      setProviders(provs.providers || []);
    } catch (e: any) {
      toast({ variant: 'destructive', title: '加载失败', description: e?.response?.data?.detail || e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openCreate = () => {
    setEditing(null);
    const defaultProvider = providers[0]?.key || 'openai';
    const initial = { ...EMPTY_INPUT, provider: defaultProvider };
    setForm(initial);
    setExtraConfigText(JSON.stringify(initial.extra_config || {}, null, 2));
    setExtraConfigError('');
    setDrawerOpen(true);
  };

  const openEdit = (row: AdminLLMModel) => {
    setEditing(row);
    setForm({
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      provider: row.provider,
      model: row.model,
      api_key: '', // empty = leave unchanged on submit
      base_url: row.base_url,
      extra_config: row.extra_config || {},
      enabled: row.enabled,
      visible_to_users: row.visible_to_users,
      is_default: row.is_default,
      sort_order: row.sort_order,
    });
    setExtraConfigText(JSON.stringify(row.extra_config || {}, null, 2));
    setExtraConfigError('');
    setDrawerOpen(true);
  };

  const submitForm = async () => {
    let extra_config: Record<string, any> = {};
    try {
      extra_config = JSON.parse(extraConfigText || '{}');
    } catch {
      setExtraConfigError('JSON 格式错误');
      return;
    }

    if (!form.name || !form.display_name || !form.provider || !form.model) {
      toast({ variant: 'destructive', title: '请填写必填字段（标识、显示名、provider、model）' });
      return;
    }

    setSubmitting(true);
    try {
      const payload: LLMModelInput = { ...form, extra_config };
      // On edit: empty api_key means "don't change" — strip it from payload
      // so the backend leaves the stored secret alone.
      if (editing && (!payload.api_key || payload.api_key.trim() === '')) {
        delete (payload as any).api_key;
      }
      if (editing) {
        await adminModelsApi.update(editing.id, payload);
        toast({ variant: 'success', title: '已更新', description: form.name });
      } else {
        await adminModelsApi.create(payload);
        toast({ variant: 'success', title: '已创建', description: form.name });
      }
      setDrawerOpen(false);
      loadAll();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '保存失败', description: e?.response?.data?.detail || e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (row: AdminLLMModel, field: 'enabled' | 'visible_to_users') => {
    try {
      await adminModelsApi.update(row.id, { [field]: !row[field] });
      loadAll();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '操作失败', description: e?.response?.data?.detail || e?.message });
    }
  };

  const handleSetDefault = async (row: AdminLLMModel) => {
    if (row.is_default) return;
    try {
      await adminModelsApi.update(row.id, { is_default: true });
      toast({ variant: 'success', title: '已设为默认', description: row.display_name });
      loadAll();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '操作失败', description: e?.response?.data?.detail || e?.message });
    }
  };

  const handleDelete = (row: AdminLLMModel) => {
    showConfirm({
      title: '确认删除',
      description: `删除模型 "${row.display_name}" 吗？正在使用此模型的对话将回退到默认模型。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await adminModelsApi.delete(row.id);
          toast({ variant: 'success', title: '已删除' });
          loadAll();
        } catch (e: any) {
          toast({ variant: 'destructive', title: '删除失败', description: e?.response?.data?.detail || e?.message });
        }
      },
    });
  };

  const handleTest = async (row: AdminLLMModel) => {
    setTestingId(row.id);
    setTestResult(null);
    try {
      const r = await adminModelsApi.test(row.id);
      setTestResult({
        id: row.id,
        ok: r.ok,
        message: r.message,
        latency_ms: r.latency_ms,
        reply: r.data?.reply,
      });
    } catch (e: any) {
      setTestResult({
        id: row.id,
        ok: false,
        message: e?.response?.data?.detail || e?.message || '请求失败',
        latency_ms: 0,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleProviderChange = (key: string) => {
    const spec = providers.find((p) => p.key === key);
    setForm((prev) => ({
      ...prev,
      provider: key,
      // If user hasn't set a custom base_url, fall back to nothing
      // (backend will resolve provider default at runtime).
      base_url: prev.base_url && prev.base_url !== providerSpec?.default_base_url ? prev.base_url : '',
    }));
  };

  if (loading && models.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          共 {models.length} 个模型 ·{' '}
          <span className="text-foreground">{models.filter((m) => m.enabled).length} 启用</span> ·{' '}
          <span className="text-foreground">{models.filter((m) => m.visible_to_users && m.enabled).length} 对用户可见</span>
        </p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          添加模型
        </Button>
      </div>

      {models.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">暂无模型</h3>
            <p className="text-muted-foreground mb-4">添加至少一个模型，用户才能使用对话功能</p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> 添加模型
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {models.map((m) => {
            const provLabel = providers.find((p) => p.key === m.provider)?.display_name || m.provider;
            const result = testResult && testResult.id === m.id ? testResult : null;
            return (
              <Card key={m.id} className={!m.enabled ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {m.display_name}
                        {m.is_default && (
                          <Badge variant="default" className="gap-1">
                            <Star className="w-3 h-3" /> 默认
                          </Badge>
                        )}
                      </CardTitle>
                      <code className="text-xs text-muted-foreground">{m.name}</code>
                    </div>
                    <Badge variant="outline">{provLabel}</Badge>
                  </div>
                  <CardDescription className="mt-2 space-y-1">
                    <div className="font-mono text-xs">{m.model}</div>
                    {m.base_url && <div className="font-mono text-xs truncate text-muted-foreground">{m.base_url}</div>}
                    {m.api_key_masked && (
                      <div className="text-xs text-muted-foreground">key: <code>{m.api_key_masked}</code></div>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {!m.enabled && <Badge variant="outline">已停用</Badge>}
                    {m.enabled && (
                      <Badge variant={m.visible_to_users ? 'secondary' : 'outline'}>
                        {m.visible_to_users ? '对用户可见' : '仅 admin 可用'}
                      </Badge>
                    )}
                    {m.description && <span className="text-xs text-muted-foreground line-clamp-1">{m.description}</span>}
                  </div>
                  {result && (
                    <div className={`text-xs flex items-center gap-2 ${result.ok ? 'text-chart-2' : 'text-chart-5'}`}>
                      {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span>{result.message}</span>
                      {result.reply && <span className="text-muted-foreground truncate">→ {result.reply}</span>}
                    </div>
                  )}
                </CardContent>
                <Separator />
                <div className="flex items-center justify-end gap-1 p-3 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTest(m)}
                    disabled={testingId === m.id}
                  >
                    <Search className="w-4 h-4 mr-1.5" />
                    {testingId === m.id ? '测试中...' : '测试'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(m, 'enabled')}>
                    {m.enabled ? <Pause className="w-4 h-4 mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
                    {m.enabled ? '停用' : '启用'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(m, 'visible_to_users')} disabled={!m.enabled}>
                    {m.visible_to_users ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
                    {m.visible_to_users ? '对用户隐藏' : '对用户开放'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(m)} disabled={m.is_default || !m.enabled}>
                    <Star className="w-4 h-4 mr-1.5" />
                    设为默认
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                    <Edit2 className="w-4 h-4 mr-1.5" /> 编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(m)} className="text-chart-5 hover:text-chart-5">
                    <Trash2 className="w-4 h-4 mr-1.5" /> 删除
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-3xl max-h-[88vh] flex flex-col">
            <DrawerHeader>
              <DrawerTitle>{editing ? `编辑模型 · ${editing.display_name}` : '添加模型'}</DrawerTitle>
              <DrawerDescription>
                Provider 决定 base_url 和 quirks；同一个 API Key 可以配多条记录指向不同的上游 model。
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 pb-4 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>标识 (slug) *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="gpt-4o-prod"
                    disabled={!!editing}
                    className={editing ? 'cursor-not-allowed' : ''}
                  />
                  <p className="text-xs text-muted-foreground">{editing ? '创建后不可修改' : '客户端引用此名称'}</p>
                </div>
                <div className="space-y-2">
                  <Label>显示名 *</Label>
                  <Input
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="GPT-4o (生产)"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  rows={2}
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="给运维和用户的简短说明"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Provider *</Label>
                  <Select value={form.provider} onValueChange={handleProviderChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model id *</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="gpt-4o / qwen-max / glm-4-plus / Doubao1.5-thinking-pro"
                    className="font-mono"
                  />
                </div>
              </div>

              {/* Provider 默认值与配置规范 — 一旦选择 provider 就把它的默认 base
                  URL、能力位、官方文档链接、备注约定全部铺出来，避免管理员
                  到处翻代码或猜模型支持什么。 */}
              {providerSpec && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                  <div className="flex items-start gap-2 text-sm">
                    <Info className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{providerSpec.display_name} 配置规范</div>
                      {providerSpec.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {providerSpec.description}
                        </div>
                      )}
                    </div>
                    {providerSpec.docs_url && (
                      <a
                        href={providerSpec.docs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
                      >
                        官方文档 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Capability badges */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline" className={providerSpec.supports_reasoning ? 'border-primary/40 text-primary' : 'opacity-60'}>
                      <Brain className="w-3 h-3 mr-1" />
                      深度思考 {providerSpec.supports_reasoning ? '✓' : '✗'}
                    </Badge>
                    <Badge variant="outline" className={providerSpec.supports_file_upload ? 'border-primary/40 text-primary' : 'opacity-60'}>
                      <Paperclip className="w-3 h-3 mr-1" />
                      文件附件 {providerSpec.supports_file_upload ? '✓' : '✗'}
                    </Badge>
                    <Badge variant="outline" className={providerSpec.api_key_required ? '' : 'opacity-60'}>
                      <KeyRound className="w-3 h-3 mr-1" />
                      API Key {providerSpec.api_key_required ? '必填' : '可选'}
                    </Badge>
                  </div>

                  {/* Default base URL with one-click copy */}
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>默认 base_url：</span>
                      {providerSpec.default_base_url ? (
                        <>
                          <code className="font-mono bg-background/70 px-1.5 py-0.5 rounded border border-border/50">
                            {providerSpec.default_base_url}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(providerSpec.default_base_url || '');
                              toast({ title: '已复制' });
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            title="复制"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <span className="italic">无 — 必须手动填写</span>
                      )}
                    </div>
                  </div>

                  {providerSpec.notes && (
                    <div className="text-xs text-muted-foreground pt-1 border-t border-primary/10">
                      <span className="font-medium text-foreground/80">备注：</span> {providerSpec.notes}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Base URL</Label>
                <Input
                  value={form.base_url || ''}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder={providerSpec?.default_base_url || '必填（自定义 OpenAI 兼容端点）'}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {providerSpec?.default_base_url
                    ? '留空使用上方的 provider 默认值；填写则覆盖默认。'
                    : '自定义 provider 必须填写 base_url。'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>API Key {!providerSpec?.api_key_required && <span className="text-xs text-muted-foreground">(可选)</span>}</Label>
                <Input
                  type="text"
                  value={form.api_key || ''}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder={editing ? '留空表示不修改' : 'sk-... 或 ${LLM_API_KEY}'}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  支持 <code>$&#123;ENV_VAR&#125;</code> 占位符，从容器/进程环境变量读取（推荐，避免明文入库）
                </p>
                {editing && (
                  <p className="text-xs text-muted-foreground">
                    当前: <code>{editing.api_key_masked || '(未设置)'}</code>
                  </p>
                )}
              </div>

              <JsonEditor
                label="高级配置 (extra_config)"
                value={extraConfigText}
                onChange={(v) => { setExtraConfigText(v); setExtraConfigError(''); }}
                error={extraConfigError}
                rows={6}
                placeholder={'{\n  "temperature": 0.7\n}'}
                description={
                  <div className="text-xs text-muted-foreground space-y-1.5">
                    <p>留空即可，所有字段都是可选；任意字段写 <code>null</code> 表示用 provider 默认。</p>
                    <table className="w-full border border-border/40 rounded">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="px-2 py-1 font-medium">字段</th>
                          <th className="px-2 py-1 font-medium">默认 / 行为</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono text-[11px]">
                        <tr className="border-t border-border/30">
                          <td className="px-2 py-1"><code>temperature</code></td>
                          <td className="px-2 py-1">省略默认 <code>0.7</code></td>
                        </tr>
                        <tr className="border-t border-border/30">
                          <td className="px-2 py-1"><code>max_tokens</code></td>
                          <td className="px-2 py-1">省略表示<b>不发送</b>，由 provider 自身上限决定（推荐）</td>
                        </tr>
                        <tr className="border-t border-border/30">
                          <td className="px-2 py-1"><code>extra_body</code></td>
                          <td className="px-2 py-1">透传到 OpenAI 请求体；与 provider 自带的 extra_body 合并（用户值优先）</td>
                        </tr>
                        <tr className="border-t border-border/30">
                          <td className="px-2 py-1"><code>extra_headers</code></td>
                          <td className="px-2 py-1">追加 HTTP header；与 provider 自带 header 合并（用户值优先）</td>
                        </tr>
                        <tr className="border-t border-border/30">
                          <td className="px-2 py-1"><code>supports_reasoning</code></td>
                          <td className="px-2 py-1">
                            覆盖 provider 默认值（当前 provider:{' '}
                            <span className="font-sans">
                              {providerSpec?.supports_reasoning ? '✓' : '✗'}
                            </span>
                            ）
                          </td>
                        </tr>
                        <tr className="border-t border-border/30">
                          <td className="px-2 py-1"><code>supports_file_upload</code></td>
                          <td className="px-2 py-1">
                            覆盖 provider 默认值（当前 provider:{' '}
                            <span className="font-sans">
                              {providerSpec?.supports_file_upload ? '✓' : '✗'}
                            </span>
                            ）
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p>
                      示例（同 provider 下的 <span className="font-mono">qwen-max</span> 关掉文件附件，因为它不是 VL 模型）：
                    </p>
                    <pre className="font-mono text-[11px] bg-muted/40 border border-border/40 rounded p-2 whitespace-pre-wrap">{`{
  "temperature": 0.5,
  "supports_file_upload": false,
  "extra_body": { "enable_search": true }
}`}</pre>
                  </div>
                }
              />

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>排序</Label>
                  <Input
                    type="number"
                    value={form.sort_order ?? 0}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <input
                      id="md-enabled" type="checkbox"
                      checked={form.enabled !== false}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    <Label htmlFor="md-enabled" className="font-normal">启用</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="md-visible" type="checkbox"
                      checked={form.visible_to_users !== false}
                      onChange={(e) => setForm({ ...form, visible_to_users: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    <Label htmlFor="md-visible" className="font-normal">对用户可见</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="md-default" type="checkbox"
                      checked={form.is_default || false}
                      onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    <Label htmlFor="md-default" className="font-normal">设为默认（其他默认会被取消）</Label>
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter>
              <Button onClick={submitForm} disabled={submitting}>
                {submitting ? '保存中...' : editing ? '保存' : '创建'}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline">取消</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog />
    </div>
  );
};
