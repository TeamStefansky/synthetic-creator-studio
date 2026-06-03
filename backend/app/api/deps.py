"""Shared API dependencies + a constraint-aware exception handler."""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

from app.constraints import ConstraintViolation, StudioError


def install_exception_handlers(app) -> None:
    @app.exception_handler(ConstraintViolation)
    async def _constraint_handler(_req: Request, exc: ConstraintViolation):
        # Fail closed (C6) with a clear, structured error and HTTP 422.
        return JSONResponse(
            status_code=422,
            content={
                "error": "constraint_violation",
                "constraint": exc.constraint.value,
                "constraint_title": exc.constraint.title,
                "detail": exc.message,
            },
        )

    @app.exception_handler(StudioError)
    async def _studio_handler(_req: Request, exc: StudioError):
        return JSONResponse(
            status_code=400, content={"error": "studio_error", "detail": str(exc)}
        )
