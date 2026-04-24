"""LLM model registry — multi-provider configurable from the admin UI.

A row in this table fully describes one selectable model: which provider it
talks to, the API key (literal or `${ENV_VAR}` placeholder), the upstream
model id, and various display / availability flags.

The agent's `get_llm()` resolves a model by id, builds an OpenAI-compatible
client, and caches it for the lifetime of the process.
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON, Text
from src.models.base import Base, utc_now


class LLMModel(Base):
    """Configurable LLM entry — one row = one selectable model."""
    __tablename__ = "llm_models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Stable slug used by clients to pin a model (e.g. in ChatRequest.model_id)
    name = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(200), nullable=False)
    description = Column(Text, default="")

    # Provider key from src.agent.llm_providers.PROVIDERS — drives default
    # base_url and any provider-specific quirks (e.g. Doubao thinking flag).
    provider = Column(String(50), nullable=False)
    # Upstream model id (e.g. "gpt-4o", "qwen-max", "Doubao1.5-thinking-pro")
    model = Column(String(200), nullable=False)

    # Literal key OR ${ENV_VAR} placeholder. Never returned in raw form
    # by GET endpoints — masked to "sk-***xyz" instead.
    api_key = Column(Text, default="")
    # Optional override of provider's default base_url
    base_url = Column(String(500), default="")

    # Free-form JSON for per-model defaults / quirks:
    #   {"temperature":0.7, "max_tokens":2000,
    #    "supports_reasoning":true,
    #    "extra_body":{...}}
    extra_config = Column(JSON, nullable=False, default=dict)

    enabled = Column(Boolean, default=True, nullable=False)
    visible_to_users = Column(Boolean, default=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)

    sort_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
