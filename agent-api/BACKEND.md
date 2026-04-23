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

**新增一个 provider**：

```python
# src/agent/llm_providers/base.py
PROVIDERS["my_provider"] = ProviderSpec(
    key="my_provider",
    display_name="我的 Provider",
    default_base_url="https://my.api/v1",
    supports_reasoning=False,
    build_extra_body=lambda cfg, reasoning: cfg.get("extra_body"),
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
