"""DB-backed LLM model resolution.

Loads `LLMModel` rows on demand, materializes them into `ModelConfig`
objects (provider + resolved api_key + base_url + extras), and caches
the result process-wide. Model resolution rules:

1. If `model_id` is given, look up by `name` and verify it's `enabled` (and
   `visible_to_users` for user-facing scopes).
2. Otherwise pick the row with `is_default=True` and `enabled=True` (with
   the same visibility check). Falls back to the first enabled row when no
   default is set.
3. Raises `LLMConfigError` with a user-friendly message when nothing matches
   so the chat surface can render a clear error instead of a stack trace.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.agent.llm_providers import ProviderSpec, get_provider
from src.models.llm_model import LLMModel
from src.utils.logger import agent_logger


_ENV_PATTERN = re.compile(r"\$\{([^}]+)\}")


class LLMConfigError(RuntimeError):
    """Raised when no usable LLM is configured for the given context."""


@dataclass(frozen=True)
class ModelConfig:
    """All the info `OpenAICompatibleLLM` needs to make a single call."""
    name: str
    display_name: str
    provider_key: str
    provider: ProviderSpec
    model: str
    api_key: str
    base_url: Optional[str]
    extra_config: dict = field(default_factory=dict)


def _resolve_env(value: str) -> str:
    """Replace `${VAR}` placeholders with current process env."""
    if not value or "${" not in value:
        return value
    def repl(match: "re.Match[str]") -> str:
        return os.getenv(match.group(1), "")
    return _ENV_PATTERN.sub(repl, value)


def _row_to_config(row: LLMModel) -> ModelConfig:
    spec = get_provider(row.provider)
    api_key = _resolve_env(row.api_key or "")
    base_url = spec.resolved_base_url(row.base_url or None)

    if spec.api_key_required and not api_key:
        raise LLMConfigError(
            f"模型 '{row.name}' 缺少 API Key（provider={row.provider}）。"
            "请到「全局管理 → 模型管理」配置或检查环境变量。"
        )
    if not base_url:
        raise LLMConfigError(
            f"模型 '{row.name}' 缺少 base_url（provider={row.provider}）。"
            "自定义 OpenAI 兼容端点必须显式填写 base_url。"
        )

    return ModelConfig(
        name=row.name,
        display_name=row.display_name or row.name,
        provider_key=row.provider,
        provider=spec,
        model=row.model,
        api_key=api_key,
        base_url=base_url,
        extra_config=dict(row.extra_config or {}),
    )


# ---------------------------------------------------------------------------
# Process-level cache
# ---------------------------------------------------------------------------
# Keyed by model name. Invalidated explicitly via `invalidate_cache()` from
# the admin CRUD endpoints so saving a new key takes effect immediately.

_CACHE: dict[str, ModelConfig] = {}


def invalidate_cache(model_name: str | None = None) -> None:
    """Drop one entry (or the whole cache) — call after admin mutations."""
    if model_name is None:
        _CACHE.clear()
        agent_logger.info("LLM model cache cleared")
    else:
        _CACHE.pop(model_name, None)
        agent_logger.info(f"LLM model cache invalidated for '{model_name}'")


async def _load_row(db: AsyncSession, *, model_name: Optional[str], for_user: bool) -> LLMModel:
    """Fetch the matching row by precedence rules. Raises LLMConfigError."""
    if model_name:
        result = await db.execute(select(LLMModel).where(LLMModel.name == model_name))
        row = result.scalar_one_or_none()
        if not row:
            raise LLMConfigError(f"模型 '{model_name}' 不存在")
        if not row.enabled:
            raise LLMConfigError(f"模型 '{model_name}' 已被管理员停用")
        if for_user and not row.visible_to_users:
            raise LLMConfigError(f"模型 '{model_name}' 未对用户开放")
        return row

    # Default: prefer is_default; fall back to any enabled row.
    where = [LLMModel.enabled == True]  # noqa: E712
    if for_user:
        where.append(LLMModel.visible_to_users == True)  # noqa: E712

    result = await db.execute(
        select(LLMModel)
        .where(*where)
        .order_by(LLMModel.is_default.desc(), LLMModel.sort_order.asc(), LLMModel.id.asc())
    )
    row = result.scalars().first()
    if not row:
        raise LLMConfigError(
            "尚未配置任何可用模型。请超级管理员到「全局管理 → 模型管理」添加。"
        )
    return row


async def resolve_model(
    db: AsyncSession,
    *,
    model_name: Optional[str] = None,
    for_user: bool = True,
) -> ModelConfig:
    """Look up a model from DB (caching the materialized config)."""
    # Resolve which row first — caching by request name is cheaper but
    # would silently let a stale cache override an admin's "set default"
    # change. So always hit DB to pick the row, then cache the heavy
    # materialization (env resolution, provider lookup) by row name.
    row = await _load_row(db, model_name=model_name, for_user=for_user)
    cached = _CACHE.get(row.name)
    if cached is not None:
        return cached
    cfg = _row_to_config(row)
    _CACHE[row.name] = cfg
    return cfg


async def seed_default_model_from_env(db: AsyncSession) -> Optional[LLMModel]:
    """One-time bootstrap: when `llm_models` is empty AND `LLM_API_KEY` is set
    in the environment, insert a default Doubao model row that references the
    env var via a `${LLM_API_KEY}` placeholder.

    This is the ONLY place in the codebase that reads LLM credentials from
    environment variables. After the seed runs (or if the table already has
    rows), all runtime LLM calls go through `resolve_model()` which loads
    everything from the `llm_models` table — admins manage models via
    「全局管理 → 模型管理」 in the Web UI.
    """
    existing = await db.execute(select(LLMModel.id).limit(1))
    if existing.scalar_one_or_none() is not None:
        return None

    api_key_env = os.getenv("LLM_API_KEY", "").strip()
    if not api_key_env:
        agent_logger.warning(
            "llm_models is empty and LLM_API_KEY is not set — no model seeded. "
            "Add a model via 全局管理 → 模型管理 before chat will work."
        )
        return None

    model_name = os.getenv("LLM_MODEL", "Doubao1.5-thinking-pro")
    row = LLMModel(
        name="doubao-default",
        display_name=f"{model_name}",
        description="从环境变量 LLM_API_KEY / LLM_MODEL 自动初始化",
        provider="doubao",
        model=model_name,
        api_key="${LLM_API_KEY}",  # keep referencing env so secret stays out of DB
        base_url="",
        extra_config={"supports_reasoning": True},
        enabled=True,
        visible_to_users=True,
        is_default=True,
        sort_order=0,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    agent_logger.info(f"Seeded default LLM model from env: {row.name}")
    return row


def mask_api_key(value: str) -> str:
    """Render an API key for safe display in admin UI / logs."""
    if not value:
        return ""
    if value.startswith("${") and value.endswith("}"):
        return value  # placeholder is itself non-secret
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}***{value[-4:]}"
