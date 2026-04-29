# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Layout

```
agent-craft/
├── agent-api/       # Python backend (FastAPI + LangGraph)
│   ├── main.py      # Entry point (run from agent-api/ directory)
│   ├── src/         # Source code
│   ├── data/        # SQLite DB + user workspaces
│   ├── logs/        # Runtime logs
│   └── .env         # Environment config
├── agent-page/      # React frontend (CRA + shadcn/ui)
│   └── src/
├── Dockerfile / docker-compose.yml / Makefile / start.sh
└── README.md / BACKEND.md / FRONTEND.md
```

## Key Commands

```bash
# Backend (working dir: agent-api/)
cd agent-api && python main.py
cd agent-api && pytest tests/ -v

# Frontend (working dir: agent-page/)
cd agent-page && npm start
cd agent-page && npx react-scripts build
cd agent-page && npx tsc --noEmit

# Root shortcuts
make run          # backend
make run-page     # frontend
make dev          # both
```

## Architecture Summary

- **Agent flow**: user message → call_model → route_logic → execute_tools (loop) → END
- **Auth**: JWT tokens, role_level 1/2/3 (user/admin/super_admin)
- **Super admin (role=3)**: can only be set via direct database update, never through API
- **Frontend UI**: shadcn/ui components only, no native HTML elements, no hardcoded colors
- **API client**: `apiClient` in `api/client.ts` handles token injection + 401 redirect
- **Component reuse**: UserToolsManager/UserSkillsManager accept `api` prop for admin mode

## Important Conventions

- CRA project — use relative imports in agent-page, not `@/` aliases
- After `npx shadcn add`, fix imports from `@/lib/utils` to `../../lib/utils`
- Backend paths are relative to `agent-api/` (data/, logs/, .env all inside)
- Schema changes via Alembic: `cd agent-api && alembic revision -m "..."`, edit the generated file, then `alembic upgrade head`. Existing migrations live under `agent-api/alembic/versions/`.
- Only keep 3 doc files: README.md, BACKEND.md, FRONTEND.md — no changelogs

## 文档更新规范

- README.md 中描述功能本身，不写修改记录或变更日志
- 不创建 CHANGELOG、IMPLEMENTATION 等临时文档
