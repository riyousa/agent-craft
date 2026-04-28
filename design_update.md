# Design Update Plan · v3 Redesign

> **来源**：`https://api.anthropic.com/v1/design/h/PSKRgbxCcC9dV9GvkEezKw`，
> 已落地到 `/tmp/design-pkg2/agent-craft/`。本文档是把这套全量设计稿合入项目的实施计划。
>
> **原则**
> 1. 先做基线（颜色 / 字体 / 共享原子）→ 再做高频用户页 → 再做管理页 → 再做登录与边角 → 最后回填后端字段。
> 2. **设计里有但后端还没的字段先用 mock 数据顶上**，本文件最后一节列了所有 mock 项；功能验通后再单独开 PR 补后端。
> 3. 每个阶段独立 commit，命令 `npx tsc --noEmit` 必须通过；可视化变更需手动起 `npm start` 自查。
> 4. 旧组件在新组件验证 OK 之前不删，互不阻塞。

---

## 设计稿结构总览（10 个 Section · 14 张画板）

| # | Section | 画板 | 现有实现 | 设计稿位置 |
| --- | --- | --- | --- | --- |
| 01 | 对话主界面 | 浅 / 深 | `ChatInterface.tsx`（基本到位） | `app.jsx`（已读完） |
| 02 | 对话历史 | 浅 / 深 | `ConversationHistory.tsx`（**当前是 drawer**，需改为独立路由页） | `screens-user.jsx:33-124` |
| 03 | 工具 | 列表 + 编辑器 + 编辑器/深色 | `UserToolsManager.tsx`（form 完备，缺统一的列表样式 + 7 天指标） | `screens-user.jsx:129-433` |
| 04 | 技能 | 列表 + 编辑器 | `SkillsManager.tsx`（缺 list 样式与 7 天指标） | `screens-user.jsx:436-660` |
| 05 | 文件 / API Key | 文件 + API Key | `UserFilesManager.tsx` / `ApiKeysManager.tsx` | `screens-user.jsx:662-887` |
| 06 | 超管 · 对话 + 可观测 | 浅 / 深 | `ChatInterface.tsx`（无右侧面板） | `app.jsx`（暂不在本轮） |
| 07 | 用户管理 | 单图 | `UserManagement.tsx`（缺统计卡 + token 预算） | `screens-admin.jsx:23-132` |
| 08 | 全局工具 / 全局技能 | 双图 | `GlobalManagement.tsx`（缺风险/团队/负责人） | `screens-admin.jsx:137-296` |
| 09 | 模型管理 | 单图 | `ModelsManager.tsx`（drawer 编辑已 ok，缺 vendor 卡片样式 + 路由策略） | `screens-admin.jsx:299-484` |
| 10 | 登录 | 浅 / 深 | `pages/Login.tsx` | `screens-user.jsx:888-1041` |

> **本轮明确不实施**：Section 06 的可观测面板。它是新组件，且依赖 LangSmith / 自有 metrics 采集，单独排期。

---

## Phase 0 · 基线对齐（foundation）

**目标**：把设计稿的颜色 / 字体 / 共享原子对齐到 Tailwind + shadcn 体系，让后续每页的实现都是"翻译"，不是"重新设计"。

- [ ] 创建分支 `feat/design-redesign-v3`，作为本计划的工作分支。
- [ ] 调整 `agent-page/src/index.css` 的 HSL 变量，向设计稿的 zinc 中性 + 黑白主调对齐：
  - `--border` / `--input` 提升一档对比度；
  - `--muted` / `--muted-foreground` 与设计稿的 `chip` / `textMuted` 对齐；
  - `--accent` / `--accent-foreground` 用极少量；
  - 状态色 `--success` / `--warning` / `--destructive` / `--info` 抽出语义变量（若已有则验证一致）。
- [ ] 全局字体已是 Geist + Geist Mono（`index.css` 已 import），确认 `body` / `code` 字体栈对齐。
- [ ] 新建 `agent-page/src/components/design/`（与 `ui/` 平级）放共享 atoms：
  - `PageShell.tsx`：Sidebar + 48px PageHeader + Container + 主题 toggle 的页面外壳。
  - `PageHeader.tsx`：面包屑 + subtitle + 右侧 actions（含主题切换）。
  - `PageTitle.tsx`：页面 H1 + 描述 + 右上 actions。
  - `Toolbar.tsx`：搜索 + 多选筛选的横排工具栏。
  - `Pill.tsx`：`success` / `warn` / `danger` / `info` / `accent` / `outline` / `neutral` 七种语义胶囊（包装 shadcn `Badge`）。
  - `StatCard.tsx`：管理页常用的"数字 + 标签 + 增量"卡片。
  - `FileThumb.tsx`：26×30 折角文件徽标，按扩展名分色（XLS / PDF / DOC / JSON / PNG / …）。
  - `EmptyState.tsx`：列表为空 / 错误的兜底。
  - `Sidebar/`：拆分 `Sidebar.tsx` + `SidebarSection.tsx` + `SidebarItem.tsx` + `RecentConversations.tsx`，对齐设计稿 248px 宽 + 工作区 / 管理 / 最近 三段结构。
- [ ] **不动**任何业务组件本轮（兼容期：旧的 `Layout.tsx` 暂留）。

**交付物**：基线分支，运行 `npm start` 看到字体颜色已贴合设计稿；新原子在 Storybook 缺位的情况下用一个 `/_design` 路由临时演示（可选）。

---

## Phase 0.5 · 侧边栏对齐（独立交付）

设计稿的 sidebar 是整个 chrome 的支柱，每页都依赖它。先单独做掉再继续业务页：

- [x] **品牌行**：替换 "智能助手平台 · Agent Craft" 双行为「Logo (22px) + Agent Craft + v0.4.2 (mono)」三件套；保留 SidebarTrigger 折叠按钮放在右端。
- [x] **快速操作**：sidebar header 下方加两个 pill：
  - 「+ 新建对话」outline 风（点击 → `onNavigate('chat')` + reset thread + ⌘N hint）
  - 「⌘K 搜索…」ghost 风（暂 toast「搜索即将开放」，待 phase 4 接 backend 全文搜索）
- [x] **工作区分组**：对话 / 对话历史 / 工具 / 技能 / 文件 / API Key（API Key 从用户菜单下拉移到这里），每项右侧带数字 badge 或 ⌘ 快捷键提示。
- [x] **管理分组**（admin only）：用户管理 / 全局工具 / 全局技能 / 模型管理 / 可观测面板；分组标题带 `SUPER ADMIN` outline 徽标。L2 admin 只看到用户管理那一项；L3 super admin 看到全部。
- [x] **最近对话分组**：调 `chatApi.listConversations(1, 5)` 拿最近 5 条，每项一行：标题 + 相对时间。点击 → 跳到 `/history` 触发选中或直接加载 thread。"全部"链接在分组标题右侧。
- [x] **用户卡片**：保持现有 dropdown 行为，简化为 30px 头像 + 姓名 + L1/L3 chip + 角色文案 + 设置图标。
- [x] **激活态**：左侧 2.5px primary 强调条 + bg-accent + 字色加深；hover 用 accent/40。

## Phase 1 · 用户侧高频页

每条任务独立 commit；与现有页面并存（双写期），通过路由切换或 feature flag 决定显示哪份。

### 1.1 对话历史 → 独立路由页

- 现状：`ConversationHistory.tsx` 是 chat 内部触发的 Drawer。
- 目标：新建 `pages/ConversationHistoryPage.tsx`，路由 `/history`，**保留** drawer 入口作为快捷视图。
- 设计稿要点：
  - 顶部 PageTitle + 「归档全部」/「新对话」操作。
  - Toolbar：搜索 + 模型筛选 + 时间筛选 + 高级筛选按钮。
  - 表格列：☆收藏 / 会话标题（带预览）/ 模型 Pill / 工具数·消息数 / TOKENS / 更新时间 / 操作。
  - 底部脚注：归档 90 天后永久删除提示。
- **Mock 字段**：
  - `is_starred: boolean`（后端无）→ mock。
  - `is_archived: boolean`（后端无）→ mock。
  - `tokens_total`（后端有 `message_count`，无累计 token）→ mock 或从 LangSmith 拉。
  - `tools_called`（消息里数 tool_call 即可，可在前端聚合）。

### 1.2 工具列表

- 现状：`UserToolsManager.tsx` 列表样式不统一。
- 目标：套 `PageShell` + Table，向设计稿的紧凑 8 列布局对齐。
- 列：工具名（含描述）/ 类型 Pill / 来源（私有/全局/内置）/ 状态 Pill / 7天调用 / P95 / 更新 / 更多。
- 头部 actions：「导入 OpenAPI」「导入 MCP 服务」「新建工具」三按钮（**MCP 已实现**，OpenAPI 尚未实现 → mock 跳到一个"功能即将开放"对话框；后端补齐后再激活）。
- **Mock 字段**：`calls_7d`、`p95_ms`（后端没采集）→ mock。

### 1.3 工具编辑器（含 AI 助手）

- 现状：`UserToolsManager.tsx` 的 drawer 编辑表单已经齐全（含 AI 助手 ai_helper.py 后端）。
- 目标：套设计稿的"左编辑表单 + 右 AI 助手侧栏"双栏布局，把现有表单字段塞进左栏：
  - 左栏：基本信息 / HTTP 请求 / 参数 schema / 输出 schema / 审批策略。
  - 右栏：AI 助手聊天面板（cURL 输入 → 字段填充建议）—— 复用现有 `parse-tool-config` 接口。
- 头部：放弃 / 测试运行 / 保存并发布。
- **MCP 工具的编辑分支**保持原有 form。

### 1.4 技能列表

- 现状：`SkillsManager.tsx` 是卡片栅格。设计稿在最近一轮 chat 已经把它改成与工具一致的 list。
- 目标：套 `Table`，列：技能名（描述）/ 来源 / 工具数 / 7天运行 / P95 / 状态 / 更新；保留「需审批」徽标。
- **Mock 字段**：`runs_7d` / `users_using` / `p95_ms` → mock。

### 1.5 技能编辑器

- 现状：`SkillsManager.tsx` 的 form 已完整（含内置工具卡、prompt 模板、工具依赖检测）。
- 目标：保留所有功能，外壳替换为 PageShell；不再展示彩色技能图标（设计稿最后一轮已去掉）。
- 头部：放弃 / 测试运行 / 保存并发布。

### 1.6 文件管理

- 现状：`UserFilesManager.tsx` 用 emoji 当文件图标。
- 目标：emoji 全部换成 `<FileThumb type={ext}/>`；列表布局对齐设计稿（顶部存储用量条 + 文件类型 tabs + 表格）。
- 已存在：上传、预览、删除、对话内文件选择器（前面几次提交已经做了）。

### 1.7 API Key 管理

- 现状：`ApiKeysManager.tsx` 已存在。
- 目标：套 PageShell，新建 Key 后弹出**一次性回显**对话框（`ak_xxx...` + 一键复制按钮 + "关闭后将无法再次查看"提示）。
- 列：名称 / 前缀 / 创建时间 / 最近使用 / 状态 / 撤销。

---

## Phase 2 · 管理侧

### 2.1 用户管理

- 现状：`UserManagement.tsx`。
- 目标：在表格上方加 4 个 StatCard（活跃用户 / 本月 Token / 待审核 / 已停用）。
- 表格列：☑ / 用户（头像 + 邮箱）/ 角色 Pill（L1/L2/L3 三色）/ 团队 / 本月 Token / 消耗 ¥ / 最近活跃 / 状态 / 操作。
- **Mock 字段**：
  - `team`（后端无）→ mock 或后续加字段。
  - `monthly_tokens` / `monthly_spend_cny`（后端无聚合）→ mock。
  - `last_active_at`（后端有 `last_login_at`，可复用）→ 可直接对接。

### 2.2 全局工具 / 全局技能

- 现状：`GlobalManagement.tsx`。
- 目标：表格列加上风险等级 Pill / 负责团队 / 使用人数 / 7 天调用。
- **Mock 字段**：
  - `risk_level: 'low' | 'high'`（后端无）→ mock。
  - `team_owner` / `owner_user`（后端无）→ mock。
  - `users_using` / `calls_7d`（无指标）→ mock。

### 2.3 模型管理

- 现状：`ModelsManager.tsx`，drawer 编辑表单完备（含 provider / extra_config 配置规范，前几次提交刚做完）。
- 目标：列表换成设计稿的 vendor 卡片（左侧字母标 logo + 中段元数据 + 右侧 toggle / 配置）。
- 新增：「路由策略」子卡（默认对话 / 深度思考 / 工具调用 / 失败回退 四条 → **后端无字段**，先 mock + 不可保存的 read-only UI；后续加表）。
- **Mock 字段**：
  - `health_uptime_pct`（无健康检查）→ mock。
  - `available_for_roles`（角色可见性，后端 `visible_to_users` 是 bool 而非角色级）→ 简化为"全部角色"或后端补字段。

---

## Phase 3 · 登录页

- 现状：`pages/Login.tsx` 居中表单。
- 目标：左侧表单 + 右侧品牌信息面板（设计稿 1320×820，左 480 / 右 840）。
- 浅色：白底 + 黑字；深色：深灰底 + 白字。

---

## Phase 4 · 后端字段补齐（开新分支单独做）

> **不在本计划主分支推进**，本节只是登记当前 mock 的来源，做完前端先用 mock 数据顶住。

| 模块 | 缺失字段 / 接口 | 建议方案 |
| --- | --- | --- |
| `conversations` | `is_starred` / `is_archived` / `tokens_total` | DB 加两列 + 累计 token 在每轮结束写入 |
| `users` | `team` / `monthly_tokens` / `monthly_spend_cny` | `team` 直接加列；月度统计建一个 `usage_monthly` 表，每天聚合 |
| `tools` / `skills` | `calls_7d` / `p95_ms` / `runs_7d` / `users_using` | 接 LangSmith trace 或建 `tool_invocations` 表统计 |
| `admin_tools` / `admin_skills` | `risk_level` / `team_owner` / `owner_user` | DB 加列；前端枚举 |
| `llm_models` | `health_uptime_pct` / `available_for_roles` | 健康检查写一个 cron 周期 ping；可见角色字段加 enum |
| 路由策略 | 整个表 | 新建 `model_routing` 表（key: `default_chat` / `thinking` / `tool_call` / `fallback`，value: model_id） |
| 工具的 OpenAPI 导入 | 后端接口 | 已在路线图，前端先 mock 跳"即将开放"对话框 |

---

## Mock 数据落点

为避免 mock 散落，统一放到：

```
agent-page/src/mock/
├─ conversations.ts    # tokens_total / star / archive
├─ tool_metrics.ts     # calls_7d / p95_ms
├─ skill_metrics.ts    # runs_7d / users_using
├─ user_usage.ts       # monthly tokens & spend
├─ model_health.ts     # health_uptime_pct / routing
└─ admin_meta.ts       # risk / team / owner
```

每个 mock 模块都暴露**与未来后端 API 同形**的导出（如 `getConversationStats(threadId): Promise<...>`），后端补齐后只换实现，调用点不动。

---

## 推进节奏（建议）

| 阶段 | 预估 | 关键交付 |
| --- | --- | --- |
| Phase 0 | 0.5 天 | 颜色 / 字体 / 共享 atoms 上线，旧页面视觉无回归 |
| Phase 1.1 ~ 1.3 | 1 天 | 对话历史独立页 + 工具列表 / 编辑器 |
| Phase 1.4 ~ 1.5 | 0.5 天 | 技能列表 / 编辑器 |
| Phase 1.6 ~ 1.7 | 0.5 天 | 文件 / API Key |
| Phase 2.1 ~ 2.3 | 1 天 | 三个管理页 |
| Phase 3 | 0.25 天 | 登录页 |
| 验收 / 修整 | 0.25 天 | 全链路点一遍，list 各种空 / 满 / 错状态 |
| **总计** | **≈ 4 天** | 不含 Phase 4 后端补齐 |

---

## 检查清单（每阶段完成时打勾）

- [x] **Phase 0** 基线
- [x] **Phase 0.5** 侧边栏对齐
- [x] **Phase 1.1** 对话历史
- [x] **Phase 1.2** 工具列表
- [x] **Phase 1.3** 工具编辑器（双栏 AI 助手已落地）
- [x] **Phase 1.4** 技能列表
- [x] **Phase 1.5** 技能编辑器（920px 容器 + 元数据 header + 「预览对话」按钮）
- [x] **Phase 1.6** 文件管理（FileThumb 已替换 emoji；PageHeader 包装延后）
- [x] **Phase 1.7** API Key（独立页面 + 一次性 Key 回显）
- [x] **Phase 2.1** 用户管理
- [ ] **Phase 2.2** 全局工具 / 技能
- [ ] **Phase 2.3** 模型管理
- [ ] **Phase 3** 登录页
- [ ] **Phase 4** 后端字段补齐（独立 PR）

---

## 备注：实现规范

- **不**直接照抄设计稿的 inline-style React；改用 Tailwind + shadcn 表达同样的视觉。
- 新建组件先放 `components/design/`，**与 `ui/` 解耦**：`ui/` 是 shadcn 原子；`design/` 是基于原子的复合 atom。
- 每页保留对应的旧组件直到验收 OK，避免回归阻塞。
- 触发任何"功能未实现"路径时弹 toast 而非崩溃（例：路由策略保存按钮）。
- mock 数据生成器走单文件，禁止散落在组件里。
