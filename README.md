# Agent Craft

> 基于 LangGraph 的有状态 AI Agent，统一编排 API（**工具**）与跨系统业务流程（**技能**），并配套完整的多用户 Web 控制台。

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109%2B-009688?logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-Stateful%20Agent-FF6B6B)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9-3178C6?logo=typescript&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Radix%20%2B%20Tailwind-000000)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-Apache_2.0-blue)

---

## 目录

- [项目简介](#项目简介)
- [适用场景](#适用场景)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [使用指南](#使用指南)
- [API 概览](#api-概览)
- [开发指南](#开发指南)
- [部署](#部署)
- [更新到最新版本](#更新到最新版本)
- [文档](#文档)
- [开源协议](#开源协议)

---

## 项目简介

Agent Craft 是一个**可扩展的对话式 Agent 平台**：

- **对终端用户**：通过自然语言完成日常工作 —— 查数据、跑报表、走审批、操作内部系统。
- **对管理员**：通过 Web 控制台集中维护**全局工具/技能**，并按需下发给团队成员。
- **对开发者**：以**插件化方式**新增工具（封装单个 API）或技能（编排多个工具），无需改动 Agent 核心。

底层使用 **LangGraph** 驱动状态机，原生支持多轮对话、工具调用循环、状态持久化（checkpointer）以及敏感操作的人工审批 (`interrupt_before`)。

## 适用场景

定位：**给中小企业的研发团队，一套开箱即用的 AI Agent 编排平台**。把"让大模型懂内部系统、能调内部 API、还要带账号体系和审批流"这件事的脚手架活全干完，让你专注业务侧的工具/技能定义。

### 用 Agent Craft 帮你省掉哪些活

| 通常自建要做的事                                       | Agent Craft 直接给你的                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| 写 LangGraph 节点、工具调用循环、敏感操作中断/恢复     | Agent 引擎现成，工具/技能装饰器声明即可                         |
| 抽象多 LLM provider、密钥管理、运行时切换              | 内置 OpenAI / Qwen / GLM / 豆包 / Gemini 等 6 类适配，UI 可切换 |
| 给每个 API 手写 Pydantic schema、curl→工具的转换、技能编排 prompt | **AI 配置助手**：贴 curl 自动生成工具；自然语言描述自动编排技能 |
| 搭用户体系（注册、登录、JWT、角色、API Key）            | 三级角色 + API Key + 完整 Web 控制台                            |
| 工具治理：哪些工具属于谁、能否启停、能否下发给团队     | 个人/全局两个空间 + 启停 + 下发 + 来源标记                       |
| MCP 协议接入、stdio/HTTP/SSE transport 适配             | 「添加 MCP Server」一键发现并批量导入                            |
| Docker 化、迁移脚本、Postgres / SQLite 切换            | `docker compose up -d` 一行启动，schema 自动同步                |

### 典型落地路径（约半小时）

1. `git clone` → `docker compose up -d --build` —— 服务起来
2. 注册账号 → 一条 SQL 把自己改成超管（`role_level=3`）
3. 「全局管理 → 模型管理」加一个模型（任意 OpenAI 兼容端点都行）
4. 「全局工具管理」按几个内部 API 配工具，或导入一个 MCP Server
5. 团队成员登录即可用自然语言调内部系统

### 适合谁

- 内部 API / 流程多、想让员工"一句话查、一句话办"的中小企业
- 已经有内部接口、缺一个统一对话入口的团队
- 想试 Agent / MCP 但不想被 LangGraph 学习曲线和样板代码绊住的开发者
- 数据敏感、必须私有化部署的场景

### 暂不适合

- 大规模 SaaS 多租户（设计上是单组织部署）
- 需要可视化拖拽工作流编辑器（这是 Dify / FastGPT 的方向）
- 极致首字节延迟场景（取决于上游 LLM 本身）

## 核心特性

### Agent 引擎

- **有状态多轮对话**：基于 LangGraph 的 `StateGraph`，对话上下文通过 checkpointer 持久化（SQLite / PostgreSQL）。
- **工具自动循环**：`call_model → route_logic → execute_tools` 节点反复执行，直到模型给出终止响应。
- **流式响应**：`/chat/stream` 通过 SSE 推送 token，前端按照节点渲染。
- **人工审批**：高风险工具调用通过 `interrupt_before=["execute_tools"]` 暂停，前端弹审批后调 `/callback` 恢复。
- **可观测性**：可选接入 LangSmith，自动上报 Trace；内置 ObservabilityPanel 可视化执行链路。
- **多模型可切换**：支持任意 OpenAI 兼容端点；模型由超管在「全局管理 → 模型管理」配置（API Key 支持 `${ENV_VAR}` 占位符），用户在对话框顶部按需切换。

### 工具与技能体系

工具 / 技能分为两类：

| 形态           | 注册方式                              | 存储     | 是否可管理              | 典型用途                                    |
| -------------- | ------------------------------------- | -------- | ----------------------- | ------------------------------------------- |
| **内置 (Built-in)** | 在代码中用 `@tool` / `@skill` 装饰器静态注册 | 仅代码   | **不可** 起停/下发/删除 | 底层能力（如图表渲染 `render_chart` / Recharts）、平台原语，随服务启动加载 |
| **配置型 (Configured)** | 在前端页面创建（HTTP 请求 / 脚本编排等模板） | 数据库   | **可** 起停、编辑、下发 | 业务侧的内部 API、跨系统流程，由用户或超管按需维护 |

- **工具 (Tool)**：原子操作，对应单个内部 / 第三方 API 调用。
- **技能 (Skill)**：业务编排，把多个工具按流程串起来完成一件事。
- **内置**视为系统的"底层能力"，无需管理界面，对所有用户透明可用；不会出现在工具/技能管理列表中。
- **配置型**才进入数据库，分**个人**与**全局**两个空间：
  - 普通用户在自己的空间创建私有工具/技能；
  - 超级管理员维护全局工具/技能，并按需下发给指定用户。
  - 入库记录带 `source` 字段（`user_created` / `admin_assigned`），普通用户不能删除被下发的资源。
  - 每条记录支持**启用 / 停用**，停用后 Agent 不会加载它，也不会出现在可调用列表中。
- **支持的工具协议**：
  - **REST API**：手填或 AI 生成 endpoint / auth / 请求映射 / 响应映射，带轮询、重试、媒体落盘
  - **MCP (Model Context Protocol)**：作为 Client 接入外部 MCP Server，支持 Streamable HTTP / SSE / stdio 三种 transport；前端「添加 MCP Server」一键发现并批量导入 server 上的工具
- **AI 辅助生成**（在「工具管理」/「技能管理」页内嵌的「AI 配置助手」）：
  - **工具**：直接把 `curl` 命令、API 文档片段、或自然语言描述贴进去，LLM 自动拆出 endpoint、HTTP method、headers、auth 类型、参数 schema、请求/响应映射，把具体示例值替换为 `{{param}}` 占位符 —— 一键填进表单，校对后保存即可
  - **技能**：用自然语言描述想要的业务流程（"先查用户订单，再调审批接口，最后发飞书通知"），LLM 从**当前已有的工具列表**里自动匹配可用工具、生成 prompt 模板、列出 `required_tools` 依赖；缺什么工具会标出来让你先去补
  - 编辑现有工具/技能时也可继续用助手追加修改，不用从零写

### 多用户与权限

- **JWT 认证**：HS256，7 天过期；前端 `apiClient` 自动注入 token，401 自动跳登录。
- **三级角色**：

  | role_level | 角色       | 权限                                                   |
  | ---------- | ---------- | ------------------------------------------------------ |
  | 1          | 普通用户   | 对话、管理个人工具/技能/文件                           |
  | 2          | 管理员     | + 用户管理                                             |
  | 3          | 超级管理员 | + 全局工具/技能管理与下发（**仅可通过数据库设置**）    |

- **API Key**：除 JWT 外支持 API Key 鉴权，便于脚本/外部系统对接。

### 用户工作空间（暂未完善，调用还有问题）

- 每个用户拥有独立的文件工作空间（`data/workspaces/{user_id}/`）。
- 支持上传 / 下载 / 删除，工具调用可读写当前用户的文件目录，天然隔离。

### 前端控制台

- React 19 + shadcn/ui（Radix + Tailwind），完整支持**深色模式**。
- 模块：对话界面、对话历史、工具/技能管理、文件管理、用户管理、全局管理、可观测面板、AI 助手弹窗。
- 组件复用：`UserToolsManager` / `UserSkillsManager` 通过 `api` prop 同时支撑用户和管理员两种视图。

## 技术栈

| 层级         | 技术                                                                |
| ------------ | ------------------------------------------------------------------- |
| Agent 编排   | LangGraph (Python) + LangChain Core                                 |
| LLM          | 多 provider 支持：OpenAI / 通义千问 / 智谱 GLM / 火山豆包 / Gemini / 任意 OpenAI 兼容端点。模型在数据库中配置，可启停、可对用户隐藏 |
| 后端框架     | FastAPI + Uvicorn                                                   |
| 数据库       | SQLite（默认） / PostgreSQL，统一 SQLAlchemy 2.0 async              |
| Checkpointer | langgraph-checkpoint-sqlite / langgraph-checkpoint-postgres         |
| 迁移         | Alembic（仅 PostgreSQL 推荐；SQLite 直接 ALTER）                    |
| 认证         | JWT（python-jose）+ bcrypt 密码哈希                                 |
| 可观测性     | LangSmith（可选）                                                   |
| 前端框架     | React 19 + TypeScript（CRA）                                        |
| UI 库        | shadcn/ui (Radix UI + Tailwind CSS)                                 |
| 路由 / 状态  | React Router 6 + Context API                                        |
| 图表         | Recharts                                                            |
| 容器化       | Docker + docker-compose（含可选 Postgres profile）                  |

## 系统架构

### Agent 执行流程

```
用户消息
   │
   ▼
┌─────────────┐      ┌──────────────┐
│ call_model  │─────▶│ route_logic  │
└─────────────┘      └──────┬───────┘
       ▲                    │
       │                    ├── 有 tool_calls ──▶ ┌────────────────┐
       │                    │                    │ execute_tools  │
       │                    │                    └───────┬────────┘
       │                    │                            │
       └────────────────────┘◀───────────────────────────┘
                            │
                            └── 无 tool_calls ──▶ END (返回响应给用户)
```

- 每次状态转移由 checkpointer 持久化，可在任意节点恢复。
- 当节点为 `execute_tools` 且工具被标记为敏感时，图执行会**中断**，等待 `/callback` 注入审批结果。

### 系统组件视图

```
┌─────────────────────────────────────────────────────┐
│  Browser (React + shadcn/ui)                        │
│  ChatInterface · Tools · Skills · Admin · Files     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / SSE
                       ▼
┌─────────────────────────────────────────────────────┐
│  FastAPI (agent-api)                                │
│  ├─ /chat/stream     SSE 流式对话                    │
│  ├─ /callback        审批恢复                       │
│  ├─ /user/*          个人工具/技能/文件              │
│  ├─ /admin/*         用户/全局工具/全局技能管理      │
│  └─ /api-keys/*      API Key 管理                   │
└──────┬─────────────────────────────────┬────────────┘
       │                                 │
       ▼                                 ▼
┌────────────────┐               ┌────────────────────┐
│ LangGraph Core │               │ SQLAlchemy (async) │
│  - StateGraph  │               │  Users · Tools     │
│  - Tools cache │               │  Skills · Sessions │
│  - Checkpointer│◀──────────────│  Workspaces · Logs │
└──────┬─────────┘               └────────────────────┘
       │
       ▼
┌────────────────┐               ┌────────────────────┐
│ Volcano LLM    │               │  LangSmith (可选)   │
└────────────────┘               └────────────────────┘
```

## 项目结构

``` text
agent-craft/
├── agent-api/                       # 后端服务（Python / FastAPI）
│   ├── main.py                      # 启动入口（必须从该目录运行）
│   ├── requirements.txt
│   ├── alembic/  alembic.ini        # 数据库迁移（PostgreSQL）
│   ├── .env / .env.example          # 环境配置
│   ├── data/                        # SQLite DB + 用户工作空间
│   ├── logs/                        # 运行日志（按天滚动）
│   ├── scripts/                     # init_db.py 等初始化脚本
│   ├── tests/                       # pytest 测试
│   └── src/
│       ├── agent/                   # LangGraph: graph / nodes / state / llm
│       ├── api/                     # FastAPI 路由（auth / chat / admin / user）
│       ├── db/                      # 数据库会话与初始化
│       ├── models/                  # SQLAlchemy 模型
│       ├── tools/                   # 工具注册中心 + 内置工具
│       ├── skills/                  # 技能注册中心 + 内置技能
│       ├── services/                # 业务服务（工作空间、工具下发等）
│       ├── utils/                   # 通用工具函数
│       └── config.py                # Settings (pydantic-settings)
│
├── agent-page/                      # 前端应用（React 19 / shadcn/ui）
│   ├── package.json
│   ├── tailwind.config.js
│   ├── components.json              # shadcn 配置
│   ├── nginx.conf                   # 容器内反向代理到 agent-api
│   └── src/
│       ├── api/                     # 统一的 apiClient（含 token & 401 处理）
│       ├── contexts/                # AuthContext / ThemeContext
│       ├── components/              # 业务组件 + ui/（shadcn 原子组件）
│       ├── pages/                   # 登录 / 注册
│       ├── hooks/                   # 自定义 hooks
│       └── App.tsx                  # 路由 + 全局布局
│
├── Dockerfile                       # 后端镜像
├── docker-compose.yml               # 编排：agent-api + agent-page (+ postgres)
├── Makefile                         # 常用命令
├── start.sh                         # 本地一键启动（前后端并行）
├── .env.example                     # docker-compose 端口/凭据覆盖
├── README.md / BACKEND.md / FRONTEND.md
└── CLAUDE.md                        # Claude Code 协作约定
```

## 快速开始

### 前置要求

- **Python** ≥ 3.10
- **Node.js** ≥ 18 + npm
- **任意支持的 LLM provider 的 API Key**（用于首次种子，配到 `LLM_API_KEY`；可后续在 Web UI 增删模型）
- 可选：Docker / Docker Compose、PostgreSQL 16+、LangSmith Key

### 方式一：Docker Compose（推荐）

```bash
# 1. 准备环境变量
cp agent-api/.env.example agent-api/.env
$EDITOR agent-api/.env       # 至少填入 LLM_API_KEY、SECRET_KEY（或留空 LLM_API_KEY 启动后再用 Web UI 添加模型）

# 2. 一键启动（默认 SQLite）
docker compose up -d --build

# 3. 访问
# 前端:    http://localhost:3000
# 后端:    http://localhost:8000   (API 文档: /docs)

# 切换 PostgreSQL：
#   编辑 agent-api/.env, 改 DATABASE_URL=postgresql+asyncpg://agent:agent@postgres:5432/system_agent
docker compose --profile postgres up -d --build
```

### 方式二：本地开发

```bash
# === 后端 ===
cd agent-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                    # 填写 LLM_API_KEY、SECRET_KEY 等
python scripts/ensure_schema.py         # 建表 + alembic 同步（首次 + 升级都用它）
python main.py                          # http://localhost:8000

# === 前端（新终端）===
cd agent-page
npm install
npm start                               # http://localhost:3000

# === 或者一行启动两端 ===
make dev                                # 调用 ./start.sh
```

### 创建超级管理员

`role_level = 3` **不能**通过任何 API 设置，只能直接改库：

```bash
# SQLite
sqlite3 agent-api/data/agent.db \
  "UPDATE users SET role_level = 3 WHERE username = 'your_username';"

# PostgreSQL
psql -d system_agent \
  -c "UPDATE users SET role_level = 3 WHERE username = 'your_username';"
```

## 配置说明

后端配置位于 `agent-api/.env`，关键变量：

| 变量                    | 说明                                                              | 示例 / 默认                                                |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `LLM_API_KEY`           | 一次性引导：首启时若 `llm_models` 表为空，自动种子一条默认豆包模型记录（数据库 `api_key` 字段引用 `${LLM_API_KEY}` 占位符）；运行时 LLM 调用统一从数据库读取，不再读 env | - |
| `LLM_MODEL`             | 种子模型名（仅首启自动种子时使用，之后随时在 Web UI 切换）         | `Doubao1.5-thinking-pro`                                   |
| `DATABASE_URL`          | 数据库连接串                                                      | `sqlite+aiosqlite:///./data/agent.db`                      |
| `CHECKPOINTER_TYPE`     | LangGraph checkpointer 类型                                       | `sqlite` / `postgres`                                      |
| `SECRET_KEY`            | JWT 签名密钥（必填，生产请用强随机串）                            | -                                                          |
| `API_HOST` / `API_PORT` | 监听地址                                                          | `0.0.0.0` / `8000`                                         |
| `LANGCHAIN_TRACING_V2`  | 启用 LangSmith                                                    | `true` / `false`                                           |
| `LANGCHAIN_API_KEY`     | LangSmith Key                                                     | -                                                          |
| `LANGCHAIN_PROJECT`     | LangSmith 项目名                                                  | `agent-craft`                                              |

`docker-compose.yml` 端口、Postgres 凭据可通过项目根 `.env`（参考 `.env.example`）覆盖。

## 使用指南

### 普通用户

1. 注册 / 登录后进入 **对话界面**，直接发送消息即可触发 Agent。
2. 在 **工具 / 技能** 页面创建私有资源，或使用管理员下发的资源。
3. 在 **文件管理** 上传文件，对话中可让 Agent 读取/处理。
4. 触发敏感操作时会弹出**审批对话框**，确认后继续执行。

### 管理员（role_level ≥ 2）

- **用户管理**：增删改查用户、调整 `role_level`（仅 1 ↔ 2，不可设 3）。

### 超级管理员（role_level = 3）

- **全局工具 / 技能管理**：维护组织级资源。
- **下发**：选择目标用户，将全局资源加入其个人空间（`source = admin_assigned`）。

## API 概览

完整 OpenAPI 文档：启动后访问 `http://localhost:8000/docs`。

| 方法     | 路径                  | 说明                  | 权限         |
| -------- | --------------------- | --------------------- | ------------ |
| POST     | `/auth/register`      | 注册                  | 公开         |
| POST     | `/auth/login`         | 登录，签发 JWT        | 公开         |
| POST     | `/chat/stream`        | 流式对话（SSE）       | 登录         |
| POST     | `/callback`           | 审批回调，恢复执行    | 登录         |
| CRUD     | `/conversations/*`    | 对话历史              | 登录         |
| CRUD     | `/user/tools/*`       | 个人工具              | 登录         |
| CRUD     | `/user/skills/*`      | 个人技能              | 登录         |
| CRUD     | `/user/files/*`       | 个人文件              | 登录         |
| CRUD     | `/api-keys/*`         | 个人 API Key          | 登录         |
| CRUD     | `/admin/users/*`      | 用户管理              | role ≥ 2     |
| CRUD     | `/admin/tools/*`      | 全局工具              | role ≥ 3     |
| CRUD     | `/admin/skills/*`     | 全局技能              | role ≥ 3     |
| GET      | `/health`             | 健康检查              | 公开         |

## 开发指南

详细规范见 [`agent-api/BACKEND.md`](agent-api/BACKEND.md) 与 [`agent-page/FRONTEND.md`](agent-page/FRONTEND.md)。

### 新增工具 / 技能

按用途选一种方式：

| 场景                                   | 推荐方式                                        |
| -------------------------------------- | ----------------------------------------------- |
| 平台底层能力 / 所有用户都需要的原语    | **内置** —— 在代码里用 `@tool` / `@skill` 注册   |
| 业务侧 API、按用户/团队差异化下发的流程 | **配置型** —— 在前端「工具/技能管理」页面创建   |

#### 内置工具（代码注册，作为底层能力）

```python
# agent-api/src/tools/render_chart.py 这类，与服务一起加载
from langchain_core.tools import tool
from pydantic import BaseModel, Field

class SearchArgs(BaseModel):
    query: str = Field(description="搜索关键词")
    limit: int = Field(default=10)

@tool(args_schema=SearchArgs)
async def web_search(query: str, limit: int = 10) -> dict:
    """搜索网络内容"""
    return {"results": [...]}
```

由 `get_all_tools()` 自动发现并注册到 Agent，**不会**出现在管理界面，不可起停/下发。仅在希望该能力对所有用户**默认可用**时使用。

#### 内置技能（代码注册）

```python
# agent-api/src/skills/my_skill.py
from src.skills.base import skill

@skill(name="analyze_and_report", display_name="分析并生成报告", category="analysis")
async def analyze_and_report(data_source: str, user_info: dict) -> dict:
    # 内部组合多个工具调用
    return {"report": "..."}
```

#### 配置型工具 / 技能（页面创建，入库管理）

无需写代码，登录后在前端「工具管理」/「技能管理」页面新建即可：

- 普通用户创建的资源属于**个人空间**（`source = user_created`）。
- 超级管理员在「全局管理」页面创建后，可**下发**到指定用户的个人空间（`source = admin_assigned`）。
- 每条记录可随时**启用 / 停用**，停用即从 Agent 的可调用工具列表中移除。

### 新增前端页面

- 组件统一来自 `src/components/ui/`（shadcn）；**禁止**使用原生 HTML 元素和硬编码颜色。
- 通过 `apiClient`（`src/api/client.ts`）发起请求，自动带 token 并处理 401。
- CRA 项目：使用相对路径导入，`shadcn add` 后将 `@/lib/utils` 改为 `../../lib/utils`。

### 常用命令

```bash
# 后端
make run               # 启动后端
make init-db           # 初始化数据库
make migrate           # alembic upgrade head（PostgreSQL）
make migrate-new m=msg # 自动生成迁移

# 前端
cd agent-page && npm start
cd agent-page && npx tsc --noEmit       # 类型检查
cd agent-page && npx react-scripts build

# 一并启动
make dev
```

## 部署

### Docker Compose（推荐生产单机部署）

```bash
docker compose up -d --build               # SQLite
docker compose --profile postgres up -d    # 含 PostgreSQL
docker compose down                         # 停止
docker compose logs -f agent-api            # 查看后端日志
```

数据卷：

- `agent-api-data` → `/app/data`（SQLite + 用户文件）
- `agent-api-logs` → `/app/logs`
- `postgres-data` → PostgreSQL 数据目录（仅 postgres profile）

### 反向代理

`agent-page` 容器自带 nginx，将 `/api/*` 反向代理到 `agent-api:8000`，前端可使用相对 URL 部署在同一域名下。如需跨域，构建时设置 `REACT_APP_API_URL`。

### PostgreSQL 模式

1. `agent-api/.env` 设置：

   ``` text
   DATABASE_URL=postgresql+asyncpg://agent:agent@postgres:5432/system_agent
   CHECKPOINTER_TYPE=postgres
   ```

2. `docker compose --profile postgres up -d --build`（容器入口自动建表 + 同步 alembic）

## 更新到最新版本

数据全部存在 Docker 数据卷 / 宿主机 `agent-api/data/` 里，升级**不会丢失**对话历史、用户文件、模型配置等数据。

> 涉及 schema / 配置不兼容变更的版本会在 release 说明里单独标注，按对应说明执行额外步骤即可；常规迭代直接走下面流程。

### 升级前备份

```bash
# SQLite 部署
docker compose exec agent-api cp /app/data/agent.db /app/data/agent.db.bak

# PostgreSQL 部署
docker compose exec postgres pg_dump -U agent system_agent > backup_$(date +%Y%m%d).sql
```

### Docker Compose 升级

```bash
git pull
docker compose up -d --build                            # 数据卷自动保留
docker compose logs -f agent-api                        # 确认无 Traceback
```

容器启动时会自动执行 `scripts/ensure_schema.py`：建出缺失的表 + 应用 alembic 迁移 + 兜底处理 schema 漂移。

### 本地开发升级

```bash
# 后端
cd agent-api && git pull
source .venv/bin/activate
pip install -r requirements.txt
python scripts/ensure_schema.py                         # 同 Docker 入口逻辑，建表 + alembic 同步
python main.py

# 前端
cd agent-page && npm install && npm start
```

### 回滚

```bash
git checkout <previous-tag-or-commit>
docker compose up -d --build

# 数据需要回滚时（必须先有备份）
docker compose cp ./agent.db.bak agent-api:/app/data/agent.db
docker compose restart agent-api
```

## 文档

- [`README.md`](README.md) ← 本文件，项目总览
- [`agent-api/BACKEND.md`](agent-api/BACKEND.md) — 后端开发规范、工具/技能扩展指南
- [`agent-page/FRONTEND.md`](agent-page/FRONTEND.md) — 前端组件、shadcn 用法、状态管理
- [`CLAUDE.md`](CLAUDE.md) — Claude Code 协作约定

---

> 仅维护以上 3 个 Markdown 文档，功能变更直接更新对应章节。

## 开源协议

本项目基于 [Apache License 2.0](LICENSE) 开源。

``` text
Copyright 2026 Agent Craft Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

允许商业使用、修改、分发与私有部署；要求保留版权声明、提供 License 副本，并在显著位置说明对源代码的修改。详见 [LICENSE](LICENSE)。
