"""Structured logging setup using ``structlog``.

JSON output in production, human-friendly console output in development. The mode is
selected by the ``NEWSRADAR_ENV`` environment variable (``dev`` by default).
"""

from __future__ import annotations

import logging
import os
import sys

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    """Configure the stdlib logging bridge and ``structlog`` processors."""

    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    is_prod = os.getenv("NEWSRADAR_ENV", "dev").lower() in {"prod", "production"}
    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer() if is_prod else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger."""

    logger: structlog.stdlib.BoundLogger = structlog.get_logger(name)
    return logger
