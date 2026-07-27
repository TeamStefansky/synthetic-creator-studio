"""Redis fixed-window rate limiter for the public router (P6).

A simple per-IP counter with a one-minute window: the Nth request in a window is
allowed while ``N <= limit``; the ``limit+1``-th returns 429. Backed by Redis so
it holds across worker processes.
"""

from __future__ import annotations

import time
from functools import lru_cache

import redis.asyncio as aioredis

from newsradar.config import get_settings
from newsradar.logging import get_logger

log = get_logger(__name__)

WINDOW_SECONDS = 60


class RateLimiter:
    """Fixed-window per-IP limiter backed by Redis ``INCR``/``EXPIRE``."""

    def __init__(self, redis_url: str, limit: int, *, window_seconds: int = WINDOW_SECONDS) -> None:
        self._url = redis_url
        self._limit = limit
        self._window = window_seconds
        self._client: aioredis.Redis | None = None

    def _redis(self) -> aioredis.Redis:
        if self._client is None:
            self._client = aioredis.from_url(self._url)
        return self._client

    async def allow(self, ip: str, *, now: float | None = None) -> bool:
        """Return True if this request is within the per-IP budget for the window.

        Fails open (allows) if Redis is unreachable — a public read must not 500
        because the limiter is down.
        """

        bucket = int((now if now is not None else time.time()) // self._window)
        key = f"nr:public:rl:{ip}:{bucket}"
        try:
            client = self._redis()
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, self._window)
            return int(count) <= self._limit
        except Exception as exc:  # noqa: BLE001 - never 500 on limiter failure
            log.warning("ratelimit.redis_unavailable", error=str(exc))
            return True


@lru_cache(maxsize=1)
def get_rate_limiter() -> RateLimiter:
    settings = get_settings()
    return RateLimiter(settings.redis_url, settings.public_rate_limit_per_min)
