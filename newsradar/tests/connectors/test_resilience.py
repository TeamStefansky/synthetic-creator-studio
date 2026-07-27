"""Rate-limit and failure-isolation primitives."""

from __future__ import annotations

import time

import httpx
import pytest

from newsradar.connectors.resilience import CircuitBreaker, TokenBucket, http_retry


def test_circuit_breaker_opens_after_threshold() -> None:
    breaker = CircuitBreaker("gdelt", threshold=5, reset_after=60)
    for _ in range(4):
        breaker.record_failure()
    assert breaker.allow() is True  # still closed at 4 failures
    breaker.record_failure()  # 5th failure opens it
    assert breaker.is_open is True
    assert breaker.allow() is False


def test_circuit_breaker_success_resets() -> None:
    breaker = CircuitBreaker("rss", threshold=3, reset_after=60)
    breaker.record_failure()
    breaker.record_failure()
    breaker.record_success()
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.allow() is True  # count was reset, only 2 since success


def test_circuit_breaker_half_opens_after_reset() -> None:
    breaker = CircuitBreaker("yt", threshold=1, reset_after=0.05)
    breaker.record_failure()
    assert breaker.is_open is True
    time.sleep(0.06)
    assert breaker.allow() is True  # half-open trial allowed


@pytest.mark.asyncio
async def test_token_bucket_limits_rate() -> None:
    bucket = TokenBucket(rate=50.0, capacity=2.0)
    start = time.monotonic()
    for _ in range(5):
        await bucket.acquire()
    elapsed = time.monotonic() - start
    # 2 burst tokens are free; the remaining 3 wait ~1/50s each.
    assert elapsed >= 3 / 50


@pytest.mark.asyncio
async def test_http_retry_recovers_after_transient_5xx() -> None:
    attempts = {"n": 0}

    async def flaky() -> str:
        attempts["n"] += 1
        if attempts["n"] < 3:
            request = httpx.Request("GET", "https://example.test")
            response = httpx.Response(503, request=request)
            raise httpx.HTTPStatusError("boom", request=request, response=response)
        return "ok"

    result = await http_retry(flaky, max_attempts=5)()
    assert result == "ok"
    assert attempts["n"] == 3


@pytest.mark.asyncio
async def test_http_retry_does_not_retry_4xx() -> None:
    attempts = {"n": 0}

    async def forbidden() -> str:
        attempts["n"] += 1
        request = httpx.Request("GET", "https://example.test")
        response = httpx.Response(403, request=request)
        raise httpx.HTTPStatusError("forbidden", request=request, response=response)

    with pytest.raises(httpx.HTTPStatusError):
        await http_retry(forbidden, max_attempts=5)()
    assert attempts["n"] == 1  # 403 is not retryable
