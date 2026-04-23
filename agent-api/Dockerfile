FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_HOME=/app

WORKDIR ${APP_HOME}

# System deps: build-essential is needed for greenlet/asyncpg wheel fallback on slim;
# curl kept for HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (cache-friendly)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy source
COPY . ${APP_HOME}/

# Writable runtime dirs
RUN mkdir -p ${APP_HOME}/data ${APP_HOME}/logs ${APP_HOME}/data/workspaces \
    && chmod +x ${APP_HOME}/entrypoint.sh

# Non-root user
RUN useradd --uid 10001 --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser ${APP_HOME}
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Entrypoint syncs DB schema (create_all + alembic stamp/upgrade) before
# starting uvicorn, so operators don't have to run migrations manually.
ENTRYPOINT ["./entrypoint.sh"]
