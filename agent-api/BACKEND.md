# 后端开发说明

## 开发规范

### 认证与鉴权

所有需要登录的接口使用 `Depends(get_current_user)` 依赖注入：

```python
from src.api.auth_deps import get_current_user
from src.models.user import User

@router.get("/something")
async def my_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # current_user 已验证且活跃
```

管理员接口使用 `admin_users.py` 中定义的依赖：

```python
from src.api.admin_users import require_admin, require_super_admin

# role_level >= 2
async def admin_endpoint(admin: User = Depends(require_admin)): ...

# role_level >= 3
async def super_endpoint(admin: User = Depends(require_super_admin)): ...
```

**超级管理员权限只能通过数据库直接修改**，API 层硬性拦截 `role_level >= 3` 的创建和修改。

### 内置工具（built-in）

`src/tools/registry.py` 集中暴露 `get_all_tools()`，返回每次启动加载的内置工具列表。当前内置：

| 名称                | 模块                              | 用途                                                                      |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `render_chart`      | `src/tools/render_chart.py`       | 用 Pydantic 校验图表 spec，输出 ` ```chart ``` ` 代码块，前端 ReactMarkdown 自动渲染交互图。 |
| `get_current_time`  | `src/tools/get_current_time.py`   | 按 IANA 时区返回当前时间（默认 Asia/Shanghai），含 ISO 8601 + UTC + 偏移。系统提示同时强制要求"涉及今天/现在/星期几等问题先调这个工具"，避免模型用训练截止日期作答。 |

**关键约定**：

- 内置工具对所有用户透明可用，不会出现在工具管理列表，不能起停。
- `get_builtin_tool_names()` 提供给 skill 下发链路（`src/services/tool_assignment.py`）使用，技能 `required_tools` 中命中内置名时不会被报为缺失依赖。
- 前端「技能编辑」页有专门的"内置工具"卡片直接展示这些工具的名字、描述、占位符片段，作者用 `{{tool:get_current_time()}}` 即可在 prompt 模板里调用。新增内置工具时，**前端 `SkillsManager.tsx` 的 `BUILTIN_TOOLS` 常量也要同步追加一项**（前后端两处都要登记）。

### 添加新工具

1. 在 `src/tools/` 创建文件
2. 定义 Pydantic 参数 schema
3. 使用 `@tool` 装饰器
4. 工具通过 `get_all_tools()` 自动注册

```python
from langchain_core.tools import tool
from pydantic import BaseModel, Field

class SearchArgs(BaseModel):
    query: str = Field(description="搜索关键词")
    limit: int = Field(default=10, description="结果数量")

@tool(args_schema=SearchArgs)
async def web_search(query: str, limit: int = 10) -> dict:
    """搜索网络内容"""
    # 实现...
    return {"results": [...]}
```

### 工具适配器（Tool Adapters）

配置型工具的执行通过适配器派发，由 `execution.type` 决定：

| `execution.type` | 适配器                                 | 用途                                    |
| ---------------- | -------------------------------------- | --------------------------------------- |
| `rest_api`（默认） | `src/tools/adapters/rest_api.py`       | 调用任意 HTTP REST 端点                 |
| `mcp`             | `src/tools/adapters/mcp.py`            | 通过 MCP 协议调用外部 MCP Server 上的工具 |

派发器在 `src/tools/adapters/__init__.py`：`get_adapter(execution_type) -> BaseToolAdapter`。

新增一种适配器：

1. 继承 `BaseToolAdapter`，实现 `execute()` 与 `test_connection()`
2. 在 `_ADAPTERS` 字典里注册
3. （可选）如果需要批量发现/导入流程，参考 `MCPAdapter.list_remote_tools()` 的写法

### 通过 MCP 协议接入工具

系统**仅作为 MCP Client**，连接外部 MCP Server 调用其暴露的工具，不反向提供 MCP Server。

- 支持的 transport：`http`（Streamable HTTP，推荐）、`sse`、`stdio`（本地子进程）
- 复用现有 auth schema：`bearer_token` / `api_key` / `basic` + `env_key`，密钥从环境变量读取

`execution` 字段约定：

```json
{
  "type": "mcp",
  "mcp": {
    "transport": "http",
    "url": "https://mcp.example.com/mcp",
    "headers": {"X-Tenant": "abc"},
    "auth": {"type": "bearer_token", "env_key": "MCP_TOKEN"},
    "timeout": 30,
    "tool_name": "search_documents"
  }
}
```

stdio 形态把 `url` 换成 `command`（数组）+ 可选 `env`：

```json
{
  "type": "mcp",
  "mcp": {
    "transport": "stdio",
    "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/data"],
    "env": {"FOO": "bar"},
    "tool_name": "read_file"
  }
}
```

**前端使用流程**：进入「工具管理」→「添加 MCP Server」→ 填写 server 配置 → 「连接并列出工具」→ 勾选所需工具 → 「导入」。导入后每个 MCP 工具是一条独立 `user_tools` 记录，可单独启停、下发（admin 侧入口同样存在）。

**注意**：

- stdio transport 要求镜像内有对应可执行文件（`npx` / `node` / `uv` 等），生产环境推荐统一用 HTTP transport
- 每次工具调用独立建连，依赖 httpx 的连接池复用；高 QPS 场景可考虑后续加 session 缓存
- MCP server 上工具的 `inputSchema` 通过 `json_schema_to_parameters()` 转成内部 `parameters` 数组，导入后保留在 `input_schema.parameters` 中

### LLM 模型适配（多 provider）

模型配置不再写死在 `.env`，而是存在 `llm_models` 表里，通过「全局管理 → 模型管理」管理。架构：

| 层                                        | 职责                                                         |
| ----------------------------------------- | ------------------------------------------------------------ |
| `src/models/llm_model.py`                 | `LLMModel` 表：name / provider / model / api_key / extra_config / enabled / visible_to_users / is_default |
| `src/agent/llm_providers/base.py`         | `PROVIDERS` 注册表（OpenAI / Qwen / GLM / Doubao / Gemini / 自定义） + `ProviderSpec` |
| `src/services/llm_service.py`             | DB → `ModelConfig`，进程级缓存，`${ENV_VAR}` 占位符解析       |
| `src/agent/llm.py`                        | `OpenAICompatibleLLM`（统一 OpenAI 兼容客户端）+ `get_llm()` |
| `src/api/admin_models.py`                 | `/admin/models/*` CRUD + 测试；`/user/models` 给用户列出可见模型 |

**API key 处理**：

- 支持明文（`sk-xxx`）或 `${ENV_VAR}` 占位符（推荐，避免明文入库）
- GET 接口返回 `api_key_masked: "sk-a***xyz"`，永不返回明文
- PATCH 时 `api_key=""` 表示"不修改"

**默认模型选择优先级**：

1. `ChatRequest.model_id`（前端传）
2. `is_default=True` 且 `enabled=True` 的模型
3. 任意 `enabled=True` 的模型（按 `sort_order` 排序）
找不到任何可用模型时 `LLMConfigError` 会被节点捕获，前端会看到友好提示。

**Provider 能力声明字段（`ProviderSpec`）**：

| 字段                   | 类型   | 用途                                                                              |
| ---------------------- | ------ | --------------------------------------------------------------------------------- |
| `supports_reasoning`   | bool   | 该 provider 是否支持深度思考开关。前端据此渲染思考切换按钮。                       |
| `supports_file_upload` | bool   | 该 provider 是否能接受用户上传的附件（图片 / PDF / 文档）。前端据此显示附件按钮。 |
| `build_extra_body`     | 回调   | `(extra_config, enable_reasoning) -> dict | None`，把开关翻成 provider-specific 的 `extra_body` 字段（如 Doubao 的 `thinking.type`、Qwen 的 `enable_thinking`）。 |
| `build_extra_headers`  | 回调   | `(extra_config) -> dict | None`，附加 HTTP header 到每次 chat 请求（如 Qwen 的 `X-DashScope-OssResourceResolve: enable`）。 |
| `transform_model_id`   | 回调   | 上行模型 id 的格式化函数，default 透传。                                          |
| `api_key_required`     | bool   | UI 是否强制要求填写 API Key。                                                     |

**每个模型的能力可被 `extra_config` 覆盖**：admin 在「模型管理」编辑某个模型时可填：

```json
{
  "supports_reasoning": true,
  "supports_file_upload": false,
  "max_tokens": 4096,
  "extra_body": {"my_custom_flag": true},
  "extra_headers": {"X-Trace": "abc"}
}
```

`/user/models` 返回给前端的 `UserVisibleModel` 把覆盖后的值合并好；前端只读最终结果，不关心是 provider 默认还是 admin 覆盖。

**`max_tokens` 默认不发**：`extra_config.max_tokens` 不设置时不会进入请求体，由 provider 自身的最大输出上限决定（避免长回复或长 JSON 被静默截断）。需要硬封顶时填一个数即可。

**新增一个 provider**：

```python
# src/agent/llm_providers/base.py
PROVIDERS["my_provider"] = ProviderSpec(
    key="my_provider",
    display_name="我的 Provider",
    default_base_url="https://my.api/v1",
    supports_reasoning=False,
    supports_file_upload=False,
    build_extra_body=lambda cfg, reasoning: cfg.get("extra_body"),
    # build_extra_headers=lambda cfg: {"X-Custom": "1"},  # 按需加
)
```

新的 provider 自动出现在 admin UI 的下拉里，无需改前端。

**.env 仅用于一次性引导**：启动时若 `llm_models` 表为空且 `LLM_API_KEY` 已设置，会自动种子一条 `doubao-default` 记录（其 `api_key` 字段是 `${LLM_API_KEY}` 占位符，密钥仍留在 env 中）。这是代码里**唯一**读取 LLM 相关 env 变量的地方；之后所有运行时调用都通过 `resolve_model()` 从数据库读取配置，新增/切换/轮换 key 都在 Web UI 完成。

### 添加新技能

1. 在 `src/skills/` 创建文件
2. 使用 `@skill` 装饰器
3. 内部组合多个工具调用

```python
from src.skills.base import skill

@skill(
    name="analyze_and_report",
    display_name="分析并生成报告",
    category="analysis",
)
async def analyze_and_report(data_source: str, user_info: dict) -> dict:
    # 步骤1: 调用查询工具
    # 步骤2: 调用分析工具
    # 步骤3: 生成报告
    return {"report": "..."}
```

### 添加新 API 路由

1. 在 `src/api/` 创建路由文件
2. 在 `src/api/app.py` 中 `include_router`

```python
from fastapi import APIRouter, Depends
router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.get("/")
async def list_items(...):
    ...
```

### 数据库配置

支持 SQLite（默认）和 PostgreSQL，通过 `.env` 中的 `DATABASE_URL` 切换：

```bash
# SQLite（默认，无需配置）
# DATABASE_URL=sqlite+aiosqlite:///./data/agent.db

# PostgreSQL
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/system_agent
```

PostgreSQL 初始化（仅需创建空库；表结构由应用启动时 `Base.metadata.create_all()` 自动建出）：

```bash
psql -U postgres -c "CREATE DATABASE system_agent;"
```

### 数据库模型

所有模型继承 `Base` + `TimestampMixin`，自动获得 `created_at` / `updated_at`：

```python
from src.models.base import Base, TimestampMixin

class MyModel(Base, TimestampMixin):
    __tablename__ = "my_table"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # ...
```

新增字段需手动 ALTER TABLE（项目未使用 Alembic）：
```bash
# SQLite
sqlite3 data/agent.db "ALTER TABLE users ADD COLUMN new_field TEXT DEFAULT '';"
# PostgreSQL
psql -d system_agent -c "ALTER TABLE users ADD COLUMN new_field TEXT DEFAULT '';"
```

### 文件附件桥接（File bridge）

不同 provider 对附件 URL 的可达性要求不同——本地的 `/assets/<id>` 是签名 URL，云端模型直接读不到。`src/agent/file_bridge.py` 在 chat 入口（`/chat` 与 `/chat/stream`）里**先于** `_build_human_message` 被调用，按当前模型的 provider 替换 URL：

```python
from src.agent.file_bridge import rewrite_file_urls_for_model
bridged = await rewrite_file_urls_for_model(
    request.file_urls or [],
    model_id=user_info.get("model_id"),
    db=db,
)
```

每个 provider 各自实现转换逻辑：

| Provider | 实现                                            | 行为                                                                                                |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `qwen`   | `src/agent/llm_providers/qwen_uploader.py`      | 把本地文件字节推到 DashScope 临时 OSS（`POST /api/v1/uploads?action=getPolicy` → 表单上传），返回 `oss://...`，48 小时有效。同 `(model, file_id)` 30 分钟内复用上传结果。 |
| 其他     | 暂未实现，pass-through                            | URL 原样下发（如 provider 反正能直接读 https / 已经是 oss / 用户手贴的远端 URL）。                |

**额外规则**：

- 上传/转换失败一律回退原 URL 不阻断对话；在 `api.log` 里记录一行 warning + 完整 traceback。
- Qwen 还需要 `X-DashScope-OssResourceResolve: enable` HTTP header，由 `ProviderSpec.build_extra_headers` 注入到 `OpenAICompatibleLLM.extra_headers`，对所有 Qwen 请求自动附带（无 `oss://` URL 时也无害）。
- 新增一个支持文件的 provider：在 `file_bridge.py` 的 `rewrite_file_urls_for_model` 里加一个 `elif provider_key == "xxx"` 分支，按该 provider 的方式上传并返回它能读的 URL 即可。

## 注意事项

- 用户工具/技能的 `source` 字段区分来源：`user_created`（用户自建）/ `admin_assigned`（管理员下发）
- 普通用户不能删除 `admin_assigned` 的资源，超级管理员在管理页面可以删除任何资源
- 对话流式响应使用 SSE (`text/event-stream`)，前端用 `fetch` + `ReadableStream` 接收
- `interrupt_before=["execute_tools"]` 触发审批流程，通过 `/callback` 接口恢复执行
- 日志输出到 `logs/` 目录，按天滚动

## 开发命令

```bash
cd agent-api && python main.py       # 启动后端
cd agent-api && pytest tests/ -v     # 运行测试
cd agent-api && python scripts/init_db.py  # 初始化数据库

# 或从项目根目录
make run
make test
make init-db
```
