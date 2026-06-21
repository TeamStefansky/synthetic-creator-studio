# Synthetic Creator Studio — backend (FastAPI + Uvicorn)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps kept minimal; Pillow + c2pa wheels are manylinux.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Persisted storage (assets + provenance manifests) and SQLite default.
RUN mkdir -p /app/storage
ENV SCS_STORAGE_DIR=/app/storage \
    SCS_DATABASE_URL=sqlite:////app/storage/scs.db

EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=4s --retries=5 \
    CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
