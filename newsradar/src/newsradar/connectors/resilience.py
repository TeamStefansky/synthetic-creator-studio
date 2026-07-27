"""Rate limiting and failure-isolation primitives for connectors.

Three independent tools:

* :class:`TokenBucket` — an async token-bucket limiter (requests per second).
* :class:`CircuitBreaker` — opens after N consecutive failures and logs a
  ``connector.circuit_open`` event; callers check :meth:`allow` before work.
* :func:`http_retry` — a ``tenacity`` retry decorator with exponential backoff
  and jitter that retries only on HTTP 429/5xx and transport errors.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_random_exponential,
)

from newsradar.logging import get_logger

log = get_logger(__name__)

_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class TokenBucket:
    """Simple async token bucket: at most ``rate`` operations per second (burst ``capacity``)."""

    def __init__(self, rate: float, capacity: float | None = None) -> None:
        if rate <= 0:
            raise ValueError("rate must be positive")
        self._rate = rate
        self._capacity = capacity if capacity is not None else max(rate, 1.0)
        self._tokens = self._capacity
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: float = 1.0) -> None:
        """Block until ``tokens`` are available, then consume them."""

        while True:
            async with self._lock:
                now = time.monotonic()
                elapsed = now - self._updated
                self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
                self._updated = now
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                deficit = tokens - self._tokens
                wait_for = deficit / self._rate
            await asyncio.sleep(wait_for)


class CircuitOpenError(RuntimeError):
    """Raised (or checked via :meth:`CircuitBreaker.allow`) when a circuit is open."""


class CircuitBreaker:
    """Opens after ``threshold`` consecutive failures; stays open for ``reset_after`` seconds."""

    def __init__(self, name: str, threshold: int = 5, reset_after: float = 300.0) -> None:
        self.name = name
        self.threshold = threshold
        self.reset_after = reset_after
        self._consecutive_failures = 0
        self._opened_at: float | None = None

    @property
    def is_open(self) -> bool:
        """Whether the breaker is currently open (and not yet in its half-open window)."""

        if self._opened_at is None:
            return False
        # After ``reset_after`` the breaker is half-open and allows a trial call.
        return (time.monotonic() - self._opened_at) < self.reset_after

    def allow(self) -> bool:
        """Return True if a call may proceed right now."""

        return not self.is_open

    def record_success(self) -> None:
        """Reset the failure count and close the breaker."""

        self._consecutive_failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        """Count a failure; open the breaker (logging once) at the threshold."""

        self._consecutive_failures += 1
        if self._consecutive_failures >= self.threshold and self._opened_at is None:
            self._opened_at = time.monotonic()
            log.warning(
                "connector.circuit_open",
                connector=self.name,
                consecutive_failures=self._consecutive_failures,
                reset_after=self.reset_after,
            )


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return isinstance(exc, httpx.TransportError)


def http_retry[T](
    func: Callable[..., Awaitable[T]],
    *,
    max_attempts: int = 4,
) -> Callable[..., Awaitable[T]]:
    """Wrap an async HTTP call with exponential backoff + jitter on 429/5xx/transport errors."""

    wrapped: Callable[..., Awaitable[T]] = retry(
        retry=retry_if_exception(_is_retryable),
        wait=wait_random_exponential(multiplier=0.5, max=30),
        stop=stop_after_attempt(max_attempts),
        reraise=True,
    )(func)
    return wrapped
