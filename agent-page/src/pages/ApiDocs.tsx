// JSON payload examples are quoted literally inside template strings;
// the `\"` escapes are intentional, not noise.
/* eslint-disable no-useless-escape */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import {
  ArrowLeft, Key, Send, CheckCircle2, XCircle, History, BarChart3, GitBranch, Bot,
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
);

const Endpoint: React.FC<{
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  path: string;
  title: string;
  desc: string;
  auth?: 'apikey' | 'jwt' | 'both';
  children: React.ReactNode;
}> = ({ method, path, title, desc, auth = 'apikey', children }) => {
  const methodColor: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-700',
    POST: 'bg-blue-500/15 text-blue-700',
    PUT: 'bg-amber-500/15 text-amber-700',
    DELETE: 'bg-red-500/15 text-red-700',
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 mb-1">
          <Badge className={`${methodColor[method]} font-mono text-xs px-2`} variant="outline">{method}</Badge>
          <code className="text-sm font-semibold">{path}</code>
          {auth === 'apikey' && <Badge variant="secondary" className="text-[10px]">API Key</Badge>}
          {auth === 'jwt' && <Badge variant="secondary" className="text-[10px]">JWT</Badge>}
          {auth === 'both' && <Badge variant="secondary" className="text-[10px]">API Key / JWT</Badge>}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
};

const CodeBlock: React.FC<{ title?: string; children: string }> = ({ title, children }) => (
  <div className="rounded-lg border overflow-hidden">
    {title && <div className="px-3 py-1.5 text-xs font-medium bg-muted/60 border-b">{title}</div>}
    <pre className="p-3 text-xs overflow-x-auto bg-muted/30 whitespace-pre-wrap">{children}</pre>
  </div>
);

const ParamTable: React.FC<{
  title: string;
  rows: { name: string; type: string; required?: boolean; desc: string }[];
}> = ({ title, rows }) => (
  <div className="rounded-lg border overflow-hidden">
    <div className="px-3 py-1.5 text-xs font-medium bg-muted/60 border-b">{title}</div>
    <table className="w-full text-xs">
      <thead className="bg-muted/30">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium">字段</th>
          <th className="text-left px-3 py-1.5 font-medium">类型</th>
          <th className="text-left px-3 py-1.5 font-medium">必填</th>
          <th className="text-left px-3 py-1.5 font-medium">说明</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name} className="border-t">
            <td className="px-3 py-1.5 font-mono">{r.name}</td>
            <td className="px-3 py-1.5 text-muted-foreground">{r.type}</td>
            <td className="px-3 py-1.5">{r.required ? '✓' : '—'}</td>
            <td className="px-3 py-1.5">{r.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const FlowDiagram: React.FC = () => (
  <div className="rounded-lg border overflow-hidden">
    <div className="px-3 py-1.5 text-xs font-medium bg-muted/60 border-b">调用流程图</div>
    <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto bg-muted/30">{`
┌──────────────┐
│  客户端请求   │
│ POST /chat   │
│ 或 /chat/stream│
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌───────────────────┐
│   LLM 推理    │────▶│  不需要工具调用？   │──── 是 ───▶ 返回最终回复
│  + 工具绑定   │     └───────────────────┘           status: "success"
└──────────────┘              │ 否
                              ▼
                   ┌─────────────────────┐
                   │  工具/技能需要审批？  │
                   │ (requires_approval)  │
                   └──────────┬──────────┘
                     │                │
                  否 │                │ 是
                     ▼                ▼
              ┌────────────┐  ┌──────────────────────┐
              │  直接执行    │  │  API Key auto_approve?│
              │  工具调用    │  └──────────┬───────────┘
              └──────┬─────┘       │            │
                     │          是 │            │ 否
                     │             ▼            ▼
                     │      ┌──────────┐ ┌────────────────┐
                     │      │ 自动放行  │ │ 返回审批请求    │
                     │      │ 继续执行  │ │ requires_approval│
                     │      └────┬─────┘ │ + approval_details│
                     │           │       └───────┬────────┘
                     │           │               │
                     │           │               ▼
                     │           │     ┌───────────────────┐
                     │           │     │ 客户端调用 /callback│
                     │           │     │ action: approve    │
                     │           │     │ 或 action: reject  │
                     │           │     └────────┬──────────┘
                     │           │              │
                     │           │    ┌─────────┴─────────┐
                     │           │    │                    │
                     │           │  approve             reject
                     │           │    │                    │
                     │           │    ▼                    ▼
                     │           │ ┌──────────┐    ┌────────────┐
                     │           │ │ 执行工具  │    │ 对话继续    │
                     │           │ │ 返回结果  │    │ 工具不执行  │
                     │           │ └────┬─────┘    └────────────┘
                     │           │      │
                     ▼           ▼      ▼
              ┌────────────────────────────────┐
              │    LLM 可能继续调用更多工具     │
              │  （已审批 skill 的依赖工具免审） │
              │     循环直到无工具调用           │
              └──────────────┬─────────────────┘
                             │
                             ▼
                     ┌──────────────┐
                     │  返回最终回复  │
                     │ status: success│
                     │ + data: [DONE] │
                     └──────────────┘
`.trim()}</pre>
  </div>
);

export default function ApiDocs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">开放接口文档</h1>
            <p className="text-muted-foreground text-sm">
              通过 API Key 集成智能助手能力到您的应用中
            </p>
          </div>
        </div>

        {/* TOC */}
        <Card className="mb-8">
          <CardContent className="pt-5 pb-4">
            <nav className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <a href="#auth" className="p-2 rounded hover:bg-muted transition-colors text-center">🔑 认证方式</a>
              <a href="#flow" className="p-2 rounded hover:bg-muted transition-colors text-center">🔀 流程图</a>
              <a href="#chat" className="p-2 rounded hover:bg-muted transition-colors text-center">💬 对话接口</a>
              <a href="#stream" className="p-2 rounded hover:bg-muted transition-colors text-center">📡 流式接口</a>
              <a href="#approval" className="p-2 rounded hover:bg-muted transition-colors text-center">✅ 审批接口</a>
              <a href="#models" className="p-2 rounded hover:bg-muted transition-colors text-center">🤖 可用模型</a>
              <a href="#helpers" className="p-2 rounded hover:bg-muted transition-colors text-center">📋 辅助接口</a>
              <a href="#charts" className="p-2 rounded hover:bg-muted transition-colors text-center">📊 图表能力</a>
              <a href="#errors" className="p-2 rounded hover:bg-muted transition-colors text-center">❌ 错误处理</a>
            </nav>
          </CardContent>
        </Card>

        {/* ───────── Auth Section ───────── */}
        <section id="auth" className="mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Key className="w-5 h-5" /> 认证方式</h2>
          <Card>
            <CardContent className="pt-6 space-y-4 text-sm">
              <p>所有接口通过 <Code>Authorization</Code> 请求头传递 API Key：</p>
              <CodeBlock title="请求头">{`Authorization: Bearer sk-xxxxxxxxxxxxxxxx`}</CodeBlock>
              <div className="space-y-2">
                <p className="font-medium">Base URL</p>
                <CodeBlock>{`${API_BASE}/api/v1`}</CodeBlock>
              </div>
              <ParamTable title="请求头参数" rows={[
                { name: 'Authorization', type: 'string', required: true, desc: 'Bearer sk-xxx 格式，由系统生成' },
                { name: 'Content-Type', type: 'string', required: true, desc: '固定为 application/json' },
              ]} />
              <div className="p-3 rounded-lg bg-chart-4/5 border border-chart-4/20 text-xs space-y-1">
                <p className="font-semibold text-chart-4">关于自动审批 (auto_approve)</p>
                <p>创建 API Key 时可开启"自动审批"。开启后，需要人工确认的工具/技能将自动放行，适用于自动化脚本、定时任务等无人值守场景。</p>
                <p>未开启的 Key 遇到审批时会返回 <Code>requires_approval: true</Code> + 审批详情，您需要调用 <Code>/callback</Code> 接口手动批准或拒绝。</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Flow Diagram ───────── */}
        <section id="flow" className="mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><GitBranch className="w-5 h-5" /> 调用流程</h2>
          <FlowDiagram />
        </section>

        <Separator className="mb-10" />

        {/* ───────── Chat Endpoints ───────── */}
        <section id="chat" className="space-y-6 mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Send className="w-5 h-5" /> 对话接口 — 非流式</h2>

          <Endpoint method="POST" path="/api/v1/chat" title="发送消息（同步）" desc="发送消息并等待完整回复。如触发审批，返回 pending_approval 状态及工具参数详情。">
            <ParamTable title="Request Body 参数" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '对话隔离标识，同一 thread 共享上下文。建议: user_{id}_{timestamp}' },
              { name: 'message', type: 'string', required: true, desc: '用户发送的消息内容' },
              { name: 'file_urls', type: 'string[]', desc: '附件 URL 数组（图片 / 文件），支持 /assets/ 签名 URL 和外链' },
              { name: 'checkpoint_id', type: 'string', desc: '对话回滚点 ID，从某个历史节点分叉继续' },
              { name: 'model_id', type: 'string', desc: '指定使用的模型名（slug）。不传则用系统默认模型。可选值见 GET /user/models' },
            ]} />
            <CodeBlock title="Request 示例">{`{
  "thread_id": "user_1_1713168000",
  "message": "查询广西省的产品配额",
  "file_urls": [],
  "model_id": "gpt-4o-prod"
}`}</CodeBlock>

            <ParamTable title="Response 字段" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '回传的对话标识' },
              { name: 'response', type: 'string', required: true, desc: 'AI 回复内容（Markdown 格式，可含图表 ```chart 代码块）' },
              { name: 'status', type: 'string', required: true, desc: '"success" = 正常完成；"pending_approval" = 等待审批' },
              { name: 'requires_approval', type: 'boolean', required: true, desc: '是否需要人工审批后才能继续' },
              { name: 'approval_details', type: 'object[] | null', desc: '待审批的工具调用详情（仅 requires_approval=true 时有值）' },
              { name: 'approval_details[].name', type: 'string', desc: '工具内部名称' },
              { name: 'approval_details[].display_name', type: 'string', desc: '工具展示名称' },
              { name: 'approval_details[].description', type: 'string', desc: '工具功能描述' },
              { name: 'approval_details[].args', type: 'object', desc: 'AI 传入的调用参数（可供人工核对）' },
            ]} />
            <CodeBlock title="Response — 正常返回">{`{
  "thread_id": "user_1_1713168000",
  "response": "| 省份 | 产品 | 总配额 | 剩余 |\\n|---|---|---|---|\\n| 广西 | 20元福袋 | 1000 | 350 |",
  "status": "success",
  "requires_approval": false,
  "approval_details": null
}`}</CodeBlock>
            <CodeBlock title="Response — 需要审批">{`{
  "thread_id": "user_1_1713168000",
  "response": "正在等待操作审批...",
  "status": "pending_approval",
  "requires_approval": true,
  "approval_details": [
    {
      "name": "update_channel_quota",
      "display_name": "修改渠道配额",
      "description": "修改指定渠道的产品配额",
      "args": { "id": "2044227999448285186", "quota": "26", "userName": "赵俊杰" }
    }
  ]
}`}</CodeBlock>
          </Endpoint>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Stream Endpoint ───────── */}
        <section id="stream" className="space-y-6 mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Send className="w-5 h-5" /> 对话接口 — 流式 SSE</h2>

          <Endpoint method="POST" path="/api/v1/chat/stream" title="发送消息（Server-Sent Events）" desc="流式返回思考过程、工具调用和最终回复。如遇审批，在 final 事件中返回 requires_approval + approval_details。">
            <ParamTable title="Request Body 参数（同 /chat）" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '对话隔离标识' },
              { name: 'message', type: 'string', required: true, desc: '用户消息' },
              { name: 'file_urls', type: 'string[]', desc: '附件 URL 数组' },
              { name: 'checkpoint_id', type: 'string', desc: '回滚分叉点' },
              { name: 'model_id', type: 'string', desc: '指定使用的模型名（slug）。不传则用系统默认模型。可选值见 GET /user/models' },
            ]} />
            <CodeBlock title="curl 示例">{`curl -N -X POST ${API_BASE}/api/v1/chat/stream \\
  -H "Authorization: Bearer sk-xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"thread_id":"t1","message":"你好","model_id":"gpt-4o-prod"}'`}</CodeBlock>

            <h3 className="font-semibold text-sm mt-4 mb-2">SSE 事件类型详解</h3>
            <div className="space-y-3">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-xs">thinking</Badge><span className="text-xs font-medium">深度思考内容</span></div>
                <p className="text-xs text-muted-foreground">仅在开启推理模式 (enable_reasoning) 时返回。展示 AI 的推理链。</p>
                <ParamTable title="字段" rows={[
                  { name: 'type', type: '"thinking"', required: true, desc: '事件类型' },
                  { name: 'content', type: 'string', required: true, desc: '思考过程文本' },
                ]} />
                <CodeBlock>{`data: {"type":"thinking","content":"用户要查询的是广西省的配额信息，我需要调用..."}`}</CodeBlock>
              </div>

              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-xs">tool_calls</Badge><span className="text-xs font-medium">AI 发起工具调用</span></div>
                <p className="text-xs text-muted-foreground">AI 决定调用一个或多个工具/技能。</p>
                <ParamTable title="字段" rows={[
                  { name: 'type', type: '"tool_calls"', required: true, desc: '事件类型' },
                  { name: 'tool_calls', type: 'object[]', required: true, desc: '工具调用列表' },
                  { name: 'tool_calls[].name', type: 'string', desc: '工具名称' },
                  { name: 'tool_calls[].args', type: 'object', desc: '调用参数' },
                  { name: 'tool_calls[].id', type: 'string', desc: '调用 ID（用于关联结果）' },
                ]} />
                <CodeBlock>{`data: {"type":"tool_calls","tool_calls":[{"name":"query_channel_product_quota","args":{"province":"广西"},"id":"call_abc"}]}`}</CodeBlock>
              </div>

              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-xs">tool_result</Badge><span className="text-xs font-medium">工具返回结果</span></div>
                <ParamTable title="字段" rows={[
                  { name: 'type', type: '"tool_result"', required: true, desc: '事件类型' },
                  { name: 'name', type: 'string', required: true, desc: '工具名称' },
                  { name: 'content', type: 'string', required: true, desc: '工具返回的文本/JSON 内容' },
                  { name: 'tool_call_id', type: 'string', desc: '对应的 tool_calls[].id' },
                ]} />
                <CodeBlock>{`data: {"type":"tool_result","name":"query_channel_product_quota","content":"[{\"province\":\"广西\",...}]"}`}</CodeBlock>
              </div>

              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-xs">ai_message</Badge><span className="text-xs font-medium">中间 AI 消息</span></div>
                <p className="text-xs text-muted-foreground">工具调用之间的 AI 中间回复（多步 workflow 时出现）。</p>
                <ParamTable title="字段" rows={[
                  { name: 'type', type: '"ai_message"', required: true, desc: '事件类型' },
                  { name: 'content', type: 'string', required: true, desc: 'AI 消息内容' },
                ]} />
              </div>

              <div className="rounded-lg border p-3 space-y-1 bg-primary/5">
                <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-xs border-primary text-primary">final</Badge><span className="text-xs font-medium">最终回复（流结束标志）</span></div>
                <p className="text-xs text-muted-foreground">每次流式调用 <strong>必定</strong> 以此事件收尾（紧随其后是 <Code>data: [DONE]</Code>）。</p>
                <ParamTable title="字段" rows={[
                  { name: 'type', type: '"final"', required: true, desc: '事件类型' },
                  { name: 'content', type: 'string', required: true, desc: 'AI 最终回复内容（Markdown）' },
                  { name: 'requires_approval', type: 'boolean', required: true, desc: '是否需要人工审批' },
                  { name: 'approval_details', type: 'object[] | null', desc: '待审批的工具详情（同 /chat 的字段结构）' },
                  { name: 'approval_details[].name', type: 'string', desc: '工具内部名称' },
                  { name: 'approval_details[].display_name', type: 'string', desc: '工具展示名称' },
                  { name: 'approval_details[].args', type: 'object', desc: 'AI 传入的调用参数' },
                ]} />
                <CodeBlock title="正常完成">{`data: {"type":"final","content":"以下是查询结果...","requires_approval":false}
data: [DONE]`}</CodeBlock>
                <CodeBlock title="需要审批">{`data: {"type":"final","content":"正在等待操作审批...","requires_approval":true,"approval_details":[{"name":"update_channel_quota","display_name":"修改渠道配额","args":{"id":"2044...","quota":"26"}}]}
data: [DONE]`}</CodeBlock>
              </div>

              <div className="rounded-lg border p-3 space-y-1 bg-destructive/5">
                <div className="flex items-center gap-2"><Badge variant="destructive" className="font-mono text-xs">error</Badge><span className="text-xs font-medium">错误事件</span></div>
                <ParamTable title="字段" rows={[
                  { name: 'type', type: '"error"', required: true, desc: '事件类型' },
                  { name: 'error', type: 'string', required: true, desc: '错误信息' },
                ]} />
                <CodeBlock>{`data: {"type":"error","error":"Tool execution failed: ConnectionError"}`}</CodeBlock>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1 mt-4">
              <p className="font-semibold">流式审批流程</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>发起 <Code>POST /chat/stream</Code>，监听 SSE 事件</li>
                <li>收到 <Code>final</Code> 事件，检查 <Code>requires_approval</Code></li>
                <li>若 <Code>true</Code>：读取 <Code>approval_details</Code>，决定是否批准</li>
                <li>调用 <Code>POST /callback</Code>（<Code>action: "approve"</Code> 或 <Code>"reject"</Code>）</li>
                <li>callback 返回工具执行结果和 AI 的后续回复</li>
                <li>如需继续对话，再次发起 <Code>/chat/stream</Code>，传入同一 <Code>thread_id</Code></li>
              </ol>
            </div>
          </Endpoint>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Approval Endpoint ───────── */}
        <section id="approval" className="space-y-6 mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> 审批接口</h2>

          <Endpoint method="POST" path="/api/v1/callback" title="批准 / 拒绝操作" desc="当 /chat 或 /chat/stream 返回 requires_approval=true 时调用，完成人工审批。">
            <ParamTable title="Request Body 参数" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '与发起对话时相同的对话 ID' },
              { name: 'action', type: '"approve" | "reject"', required: true, desc: '审批动作' },
              { name: 'callback_data', type: 'object', desc: '可选的附加数据（预留扩展）' },
            ]} />
            <CodeBlock title="批准">{`{ "thread_id": "user_1_1713168000", "action": "approve" }`}</CodeBlock>
            <CodeBlock title="拒绝">{`{ "thread_id": "user_1_1713168000", "action": "reject" }`}</CodeBlock>

            <ParamTable title="Response 字段（批准后）" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '对话 ID' },
              { name: 'status', type: 'string', required: true, desc: '"approved" 或 "rejected"' },
              { name: 'message', type: 'string', required: true, desc: '操作结果说明' },
              { name: 'new_messages', type: 'object[]', desc: '批准后产生的新消息列表' },
              { name: 'new_messages[].type', type: 'string', desc: '"ToolMessage" = 工具结果；"AIMessage" = AI 回复' },
              { name: 'new_messages[].name', type: 'string', desc: '工具名称（仅 ToolMessage）' },
              { name: 'new_messages[].content', type: 'string', desc: '消息内容' },
            ]} />
            <CodeBlock title="批准后的 Response">{`{
  "thread_id": "user_1_1713168000",
  "status": "approved",
  "message": "操作已批准",
  "new_messages": [
    { "type": "ToolMessage", "name": "update_channel_quota", "content": "{\"status\":200,...}" },
    { "type": "AIMessage", "content": "渠道配额修改成功。修改后的配额信息如下..." }
  ]
}`}</CodeBlock>
            <div className="p-3 rounded-lg bg-chart-4/5 border border-chart-4/20 text-xs space-y-1 mt-2">
              <p className="font-semibold text-chart-4">Skill 级审批说明</p>
              <p>当一个 Skill（技能）需要审批时，<strong>审批一次即可放行整个 workflow</strong>。Skill 依赖的工具在本轮对话中不再单独弹出审批，即使这些工具自身也标记了 requires_approval。</p>
              <p>审批状态在同一 <Code>thread_id</Code> 内跨消息保持，直到新建对话。</p>
            </div>
          </Endpoint>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Models Endpoint ───────── */}
        <section id="models" className="space-y-6 mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bot className="w-5 h-5" /> 可用模型</h2>

          <Endpoint method="GET" path="/api/v1/user/models" title="列出可用模型" desc="返回当前账号有权使用的 LLM 模型列表（管理员配置 enabled 且 visible_to_users）。模型列表由超级管理员在「全局管理 → 模型管理」维护，可包含 OpenAI / 通义千问 / 智谱 GLM / 火山豆包 / Gemini / 自定义 OpenAI 兼容端点等。">
            <ParamTable title="Response 字段（数组）" rows={[
              { name: 'name', type: 'string', required: true, desc: '模型 slug，作为 /chat 与 /chat/stream 的 model_id 使用' },
              { name: 'display_name', type: 'string', required: true, desc: '展示名称' },
              { name: 'description', type: 'string', desc: '管理员填写的说明' },
              { name: 'provider', type: 'string', required: true, desc: '"openai" / "qwen" / "glm" / "doubao" / "gemini" / "openai_compatible"' },
              { name: 'supports_reasoning', type: 'boolean', required: true, desc: '该模型是否支持深度思考（reasoning）模式' },
              { name: 'is_default', type: 'boolean', required: true, desc: '是否为系统默认模型（不传 model_id 时实际使用的就是它）' },
            ]} />
            <CodeBlock title="Response 示例">{`[
  {
    "name": "doubao-thinking-pro",
    "display_name": "豆包 (Doubao1.5-thinking-pro)",
    "description": "深度思考模型，适合复杂推理",
    "provider": "doubao",
    "supports_reasoning": true,
    "is_default": true
  },
  {
    "name": "gpt-4o-prod",
    "display_name": "GPT-4o (生产)",
    "description": "",
    "provider": "openai",
    "supports_reasoning": false,
    "is_default": false
  }
]`}</CodeBlock>
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
              <p className="font-semibold">使用说明</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>把上面任意一项的 <Code>name</Code> 作为 <Code>/chat</Code> 或 <Code>/chat/stream</Code> 请求体的 <Code>model_id</Code> 字段传入即可切换模型。</li>
                <li>不传 <Code>model_id</Code> 时使用 <Code>is_default=true</Code> 的模型；若管理员还没设默认，会用第一个 enabled 的模型。</li>
                <li>列表为空（HTTP 200 + <Code>[]</Code>）说明管理员尚未配置任何对用户可见的模型，此时调用 <Code>/chat</Code> 会返回带有友好提示的 AI 消息。</li>
              </ul>
            </div>
          </Endpoint>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Helper Endpoints ───────── */}
        <section id="helpers" className="space-y-6 mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold flex items-center gap-2"><History className="w-5 h-5" /> 辅助接口</h2>

          <Endpoint method="GET" path="/api/v1/history/{thread_id}" title="获取对话历史" desc="获取指定 thread 的完整消息列表。">
            <ParamTable title="路径参数" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '对话标识' },
            ]} />
            <ParamTable title="Response 字段" rows={[
              { name: 'thread_id', type: 'string', required: true, desc: '对话标识' },
              { name: 'messages', type: 'object[]', required: true, desc: '消息列表' },
              { name: 'messages[].role', type: '"user" | "assistant" | "system"', desc: '发送方角色' },
              { name: 'messages[].content', type: 'string', desc: '消息内容' },
              { name: 'messages[].timestamp', type: 'string', desc: 'ISO 8601 时间戳' },
              { name: 'total_count', type: 'number', required: true, desc: '消息总数' },
            ]} />
            <CodeBlock title="Response 示例">{`{
  "thread_id": "user_1_1713168000",
  "messages": [
    { "role": "user", "content": "查询配额", "timestamp": "2026-04-17T10:00:00Z" },
    { "role": "assistant", "content": "| 省份 | 配额 |\\n...", "timestamp": "2026-04-17T10:00:02Z" }
  ],
  "total_count": 2
}`}</CodeBlock>
          </Endpoint>

          <Endpoint method="GET" path="/health" title="健康检查" desc="无需认证，用于监控探针。注意：此接口不在 /api/v1 路径下。" auth="both">
            <ParamTable title="Response 字段" rows={[
              { name: 'status', type: '"healthy"', required: true, desc: '服务状态' },
              { name: 'version', type: 'string', required: true, desc: '服务版本号' },
            ]} />
            <CodeBlock title="Response">{`{ "status": "healthy", "version": "1.0.0" }`}</CodeBlock>
          </Endpoint>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Charts ───────── */}
        <section id="charts" className="space-y-6 mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="w-5 h-5" /> 图表能力</h2>
          <Card>
            <CardContent className="pt-6 space-y-4 text-sm">
              <p>用户要求可视化时，AI 会调用内置 <Code>render_chart</Code> 工具，在回复中嵌入 <Code>{'```chart```'}</Code> 代码块。</p>
              <p>支持类型：<Code>bar</Code>（柱状） · <Code>line</Code>（折线） · <Code>scatter</Code>（散点） · <Code>pie</Code>（饼图） · <Code>area</Code>（面积）</p>
              <ParamTable title="图表 JSON 规范（嵌在 response 中）" rows={[
                { name: 'type', type: '"bar" | "line" | "scatter" | "pie" | "area"', required: true, desc: '图表类型' },
                { name: 'title', type: 'string', desc: '图表标题' },
                { name: 'xKey', type: 'string', required: true, desc: 'data 中每行的 X 轴字段名' },
                { name: 'series', type: 'object[]', required: true, desc: '数据系列（1~8 个）' },
                { name: 'series[].dataKey', type: 'string', desc: '数值字段名，必须在 data 每行存在' },
                { name: 'series[].name', type: 'string', desc: '图例显示名' },
                { name: 'series[].color', type: 'string', desc: '颜色（hex），留空自动分配' },
                { name: 'data', type: 'object[]', required: true, desc: '数据行数组（1~500 条）' },
              ]} />
              <CodeBlock title="response 中的图表片段">{`以下是各省配额对比：

\`\`\`chart
{"type":"bar","title":"各省剩余配额","xKey":"province","series":[{"dataKey":"remaining","name":"剩余配额"}],"data":[{"province":"广西","remaining":350},{"province":"广东","remaining":200}]}
\`\`\`

从图中可以看出广西的剩余配额高于广东。`}</CodeBlock>
              <p className="text-xs text-muted-foreground">通过 API 调用时，图表 JSON 嵌在 <Code>response</Code> 文本中，您可自行解析 <Code>{'```chart ... ```'}</Code> 代码块并用 Recharts / ECharts 等库渲染。</p>
            </CardContent>
          </Card>
        </section>

        <Separator className="mb-10" />

        {/* ───────── Errors ───────── */}
        <section id="errors" className="mb-10 scroll-mt-20">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><XCircle className="w-5 h-5" /> 错误处理</h2>
          <Card>
            <CardContent className="pt-6 text-sm space-y-4">
              <p>所有错误返回 <Code>application/problem+json</Code> 格式（<a href="https://www.rfc-editor.org/rfc/rfc9457" target="_blank" rel="noopener noreferrer" className="text-primary underline">RFC 9457</a>）：</p>
              <ParamTable title="Problem Details 字段" rows={[
                { name: 'type', type: 'string', required: true, desc: '错误类型 URI，如 https://agent-craft/errors/401' },
                { name: 'title', type: 'string', required: true, desc: 'HTTP 状态码对应的标准描述' },
                { name: 'status', type: 'number', required: true, desc: 'HTTP 状态码' },
                { name: 'detail', type: 'string', required: true, desc: '具体错误信息' },
                { name: 'instance', type: 'string', required: true, desc: '触发错误的请求路径' },
                { name: 'errors', type: 'object[]', desc: '仅 422：逐字段的校验错误列表' },
              ]} />
              <CodeBlock title="错误响应示例（401）">{`{
  "type": "https://agent-craft/errors/401",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid or expired token",
  "instance": "/api/v1/chat"
}`}</CodeBlock>
              <CodeBlock title="校验错误示例（422）">{`{
  "type": "https://agent-craft/errors/validation",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Request validation failed",
  "instance": "/api/v1/chat",
  "errors": [
    { "loc": ["body", "thread_id"], "msg": "Field required", "type": "missing" }
  ]
}`}</CodeBlock>
              <h3 className="font-semibold text-xs">常见状态码</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/50"><span className="font-semibold">400</span> — 请求格式错误</div>
                <div className="p-2 rounded bg-muted/50"><span className="font-semibold">401</span> — 认证失败 / Key 无效或过期</div>
                <div className="p-2 rounded bg-muted/50"><span className="font-semibold">403</span> — 用户被禁用 / 签名过期</div>
                <div className="p-2 rounded bg-muted/50"><span className="font-semibold">404</span> — 资源不存在</div>
                <div className="p-2 rounded bg-muted/50"><span className="font-semibold">422</span> — 请求参数校验失败</div>
                <div className="p-2 rounded bg-muted/50"><span className="font-semibold">500</span> — 服务器内部错误</div>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="text-center pb-8">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> 返回
          </Button>
        </div>
      </div>
    </div>
  );
}
