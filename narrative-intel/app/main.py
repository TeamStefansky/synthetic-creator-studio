"""Narrative Intelligence & Media Monitoring — API service (Stage 1: ingestion)."""
from __future__ import annotations

from fastapi import FastAPI

from .api.routes import router

app = FastAPI(
    title="Narrative Intelligence API",
    version="0.1.0",
    description="Media monitoring & narrative intelligence platform. Stage 1: ingestion layer.",
)

app.include_router(router, prefix="/api")


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
