"""Idempotent schema bootstrap — runs at container start before uvicorn.

Why this exists:
  * `Base.metadata.create_all()` builds every table the SQLAlchemy models
    declare, but never modifies an existing table (won't add a new column,
    can't change types, etc.).
  * Alembic migrations handle column-level / cross-version changes, but
    the project's baseline migration is intentionally empty — running
    `alembic upgrade head` on a brand-new empty DB would fail at the
    first non-baseline revision (e.g. `op.add_column('api_keys', ...)`
    when the `api_keys` table doesn't exist yet).

This script reconciles both:
  1. `create_all()` — fills in any missing tables (handles fresh installs
     AND legacy DBs upgraded across a release that introduces new tables).
  2. If `alembic_version` table doesn't exist → `alembic stamp head`
     (mark the DB as already at HEAD without running migrations).
     If it exists → `alembic upgrade head` (apply pending migrations).

The result: the same script works for fresh installs, legacy upgrades,
and routine alembic-managed releases — operators don't need to think
about it.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make `src.*` importable when invoked from agent-api/
_AGENT_API_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_AGENT_API_ROOT))

from dotenv import load_dotenv
load_dotenv(_AGENT_API_ROOT / ".env")

from sqlalchemy import create_engine, inspect

from src.config import settings
from src.models.base import Base
import src.models  # noqa: F401  — registers every model on Base.metadata


def _sync_url(url: str) -> str:
    """Translate the project's async driver URLs to sync equivalents."""
    return (
        url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
        .replace("sqlite+aiosqlite://", "sqlite://")
    )


def main() -> None:
    sync_url = _sync_url(settings.database_url)
    # Don't print credentials in logs.
    safe_url = sync_url.split("@")[-1] if "@" in sync_url else sync_url
    print(f"[schema] Target: {safe_url}", flush=True)

    engine = create_engine(sync_url)

    from alembic.config import Config
    from alembic import command
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    cfg = Config(str(_AGENT_API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_AGENT_API_ROOT / "alembic"))

    # Compare current DB revision against what the migration files declare
    # as HEAD, so we can branch on the right action.
    head_rev = ScriptDirectory.from_config(cfg).get_current_head()
    with engine.connect() as conn:
        has_alembic = inspect(conn).has_table("alembic_version")
        if has_alembic:
            db_rev = MigrationContext.configure(conn).get_current_revision()
        else:
            db_rev = None

    if db_rev == head_rev and has_alembic:
        # Already aligned — typical case after the first deploy. Still run
        # create_all in case a release added a model without a migration
        # (cheap; it's a metadata-only no-op when tables exist).
        print(f"[schema] Already at head ({head_rev}) — only ensuring tables", flush=True)
        Base.metadata.create_all(engine)
        print("[schema] Done.", flush=True)
        return

    if not has_alembic:
        # Fresh install OR pre-alembic legacy DB. Baseline migration is empty
        # and later migrations assume their target tables exist, so we can't
        # `upgrade head` from scratch. Build the whole schema from models and
        # stamp HEAD so future deploys can do plain upgrades.
        print("[schema] alembic_version missing → create_all + stamp head", flush=True)
        Base.metadata.create_all(engine)
        command.stamp(cfg, "head")
        print("[schema] Done.", flush=True)
        return

    # has_alembic AND db_rev != head_rev → real upgrade needed.
    print(f"[schema] alembic upgrade {db_rev} → {head_rev}", flush=True)
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:
        # Schema drift: a previous startup's create_all already built the
        # table that a pending `op.create_table` migration is trying to
        # build, leading to "relation already exists". Reconcile by
        # stamping HEAD (we trust create_all kept us in sync structurally)
        # and then re-running create_all to backfill anything still missing.
        msg = str(exc).lower()
        if "already exists" in msg or "duplicate" in msg:
            print(
                f"[schema] upgrade hit drift ({type(exc).__name__}: "
                f"{str(exc).splitlines()[0]}) — falling back to stamp head + create_all",
                flush=True,
            )
            command.stamp(cfg, "head")
            Base.metadata.create_all(engine)
        else:
            raise

    # Defensive: ensure any model-only-no-migration tables exist.
    Base.metadata.create_all(engine)
    print("[schema] Done.", flush=True)


if __name__ == "__main__":
    main()
