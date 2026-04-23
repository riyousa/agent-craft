"""Configuration management using Pydantic settings."""
from pathlib import Path
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    """Application settings."""

    # LLM bootstrap — only used at first-time startup to seed the `llm_models`
    # table when it's empty. Runtime LLM calls always read configuration from
    # the database (see src/services/llm_service.py:resolve_model). Add /
    # rotate / disable models via 全局管理 → 模型管理 in the Web UI.
    llm_api_key: str = ""
    llm_model: str = "Doubao1.5-thinking-pro"

    # Database
    # sqlite:  sqlite+aiosqlite:///path/to/agent.db
    # postgres: postgresql+asyncpg://user:pass@host:5432/dbname
    database_url: str = f"sqlite+aiosqlite:///{PROJECT_ROOT / 'data' / 'agent.db'}"

    # LangGraph Checkpointer
    # "sqlite" uses file-based SQLite (same DB as app)
    # "postgres" uses PostgreSQL (requires CHECKPOINT_DATABASE_URL or uses DATABASE_URL)
    checkpointer_type: str = "sqlite"
    checkpoint_database_url: str = ""  # If empty, falls back to database_url

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Feishu
    feishu_app_id: str = ""
    feishu_app_secret: str = ""

    # Security
    secret_key: str = "your_secret_key_here"

    # LangSmith
    langchain_tracing_v2: str = "false"
    langchain_api_key: str = ""
    langchain_project: str = "agent-craft"
    langchain_endpoint: str = "https://api.smith.langchain.com"

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    @property
    def is_postgres(self) -> bool:
        return "postgresql" in self.database_url

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


settings = Settings()
