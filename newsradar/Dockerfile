# NewsRadar backend image — serves the FastAPI API, the Celery worker, and the
# Celery beat scheduler (one image, three commands; the compose/render service
# picks the command). Built with uv for reproducible, locked installs.
#
# Build args:
#   INSTALL_EMBEDDINGS=1  -> also install the `embeddings` extra (torch +
#                            sentence-transformers, ~2GB). Leave 0 for a lean
#                            image and set EMBEDDING_PROVIDER=hashing at runtime.
FROM python:3.12-slim AS base

ARG INSTALL_EMBEDDINGS=0
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# System libraries: WeasyPrint (PDF reports) needs pango/cairo/gdk-pixbuf +
# fonts; libpq for asyncpg build isn't required (asyncpg ships wheels) but
# build-essential covers any source builds. curl is used by the healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libffi-dev \
        fonts-dejavu-core \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# uv from the official static binary.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Dependency layer first (cached until the lockfile changes).
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    if [ "$INSTALL_EMBEDDINGS" = "1" ]; then \
        uv sync --frozen --no-install-project --extra embeddings ; \
    else \
        uv sync --frozen --no-install-project ; \
    fi

# Project source.
COPY src ./src
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini
COPY config ./config
COPY data ./data
COPY scripts ./scripts
RUN --mount=type=cache,target=/root/.cache/uv \
    if [ "$INSTALL_EMBEDDINGS" = "1" ]; then \
        uv sync --frozen --extra embeddings ; \
    else \
        uv sync --frozen ; \
    fi

ENV PATH="/app/.venv/bin:${PATH}"

# Reports are written here; a mounted disk in production overrides it.
RUN mkdir -p /app/artifacts
ENV REPORT_ARTIFACT_DIR=/app/artifacts

EXPOSE 8000

# Default command runs the API; worker/beat services override this.
CMD ["uvicorn", "newsradar.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
