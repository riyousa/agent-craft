#!/bin/sh
# Container entrypoint: ensure DB schema + alembic_version are up-to-date,
# then exec uvicorn. See scripts/ensure_schema.py for the reconciliation
# logic (handles fresh installs, legacy upgrades, and alembic upgrades).
set -e

python scripts/ensure_schema.py

exec uvicorn src.api.app:app --host 0.0.0.0 --port 8000 "$@"
