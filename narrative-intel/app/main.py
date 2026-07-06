"""Narrative Intelligence & Media Monitoring — API service (Stage 1: ingestion)."""
from __future__ import annotations

from fastapi import Depends, FastAPI

from .api.routes import router
from .security import api_key_auth, rate_limit

app = FastAPI(
    title="Narrative Intelligence API",
    version="0.1.0",
    description="Media monitoring & narrative intelligence platform.",
)

app.include_router(router, prefix="/api", dependencies=[Depends(rate_limit), Depends(api_key_auth)])


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
