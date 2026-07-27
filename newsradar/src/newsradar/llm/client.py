"""Async LLM client with concurrency limiting, retry, token accounting and a budget guard.

Every call returns a Pydantic model parsed from Anthropic tool-use / structured
output — never free-text parsing (see :mod:`newsradar.llm.schemas`). Two concrete
clients implement the same :class:`LLMClient` interface:

* :class:`AnthropicLLMClient` — the production client (async Anthropic SDK).
* :class:`FakeLLMClient`     — a deterministic test double that returns canned,
  schema-valid output. It exercises the *same* budget guard, retry loop and
  ``llm_calls`` accounting so those behaviours are covered without a live API.

Cost discipline is a functional requirement: the daily-spend guard raises
:class:`BudgetExceeded` before a call is made once the estimated spend for the
current UTC day exceeds ``LLM_DAILY_BUDGET_USD``. Enrichment degrades gracefully
(embeddings + heuristics only) when that happens.
"""

from __future__ import annotations

import abc
import asyncio
import datetime as dt
import time
from collections.abc import Callable
from typing import Any, TypeVar, cast

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from newsradar.config import get_settings
from newsradar.db.models import LlmCall
from newsradar.db.session import get_sessionmaker
from newsradar.logging import get_logger

log = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

# Per-model price per 1M tokens (input, output), USD. Used only by the spend
# guard and the cost report — approximate list rates, documented in the report.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-5": (3.0, 15.0),
}
_DEFAULT_PRICE = (1.0, 5.0)

MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 0.5


class BudgetExceeded(RuntimeError):  # noqa: N818 - name fixed by the P2 spec
    """Raised when the estimated daily LLM spend exceeds the configured budget."""


def estimated_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate the USD cost of a call from its token counts."""

    in_price, out_price = MODEL_PRICES.get(model, _DEFAULT_PRICE)
    return (input_tokens / 1_000_000) * in_price + (output_tokens / 1_000_000) * out_price


def _day_start_utc(now: dt.datetime | None = None) -> dt.datetime:
    now = now or dt.datetime.now(dt.UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


class LLMClient(abc.ABC):
    """Abstract async LLM client. Subclasses implement :meth:`_complete` only."""

    def __init__(
        self,
        *,
        daily_budget_usd: float | None = None,
        max_concurrency: int | None = None,
        sessionmaker: async_sessionmaker[Any] | None = None,
    ) -> None:
        settings = get_settings()
        self._daily_budget_usd = (
            settings.llm_daily_budget_usd if daily_budget_usd is None else daily_budget_usd
        )
        concurrency = settings.llm_max_concurrency if max_concurrency is None else max_concurrency
        self._semaphore = asyncio.Semaphore(max(1, concurrency))
        self._sessionmaker = sessionmaker

    def _factory(self) -> async_sessionmaker[Any]:
        return self._sessionmaker if self._sessionmaker is not None else get_sessionmaker()

    async def _spend_today_usd(self) -> float:
        """Sum the estimated spend recorded in ``llm_calls`` for the current UTC day."""

        factory = self._factory()
        async with factory() as session:
            rows = (
                await session.execute(
                    select(LlmCall.model, LlmCall.input_tokens, LlmCall.output_tokens).where(
                        LlmCall.created_at >= _day_start_utc(), LlmCall.ok.is_(True)
                    )
                )
            ).all()
        return sum(estimated_cost_usd(m, i, o) for m, i, o in rows)

    async def _record(
        self,
        *,
        purpose: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        ok: bool,
        error: str | None,
    ) -> None:
        factory = self._factory()
        async with factory() as session:
            session.add(
                LlmCall(
                    purpose=purpose,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                    ok=ok,
                    error=error,
                )
            )
            await session.commit()

    @abc.abstractmethod
    async def _complete(
        self, *, purpose: str, model: str, system: str, user: str, response_model: type[T]
    ) -> tuple[T, int, int]:
        """Perform one structured completion.

        Returns ``(parsed, input_tokens, output_tokens)``. Raising an exception
        for which :meth:`_is_retryable` is true triggers a backoff retry.
        """

    def _is_retryable(self, exc: BaseException) -> bool:  # noqa: ARG002 - overridden
        return False

    async def generate_structured(
        self,
        *,
        purpose: str,
        model: str,
        system: str,
        user: str,
        response_model: type[T],
    ) -> T:
        """Run a structured call under the budget guard, semaphore and retry loop."""

        spend = await self._spend_today_usd()
        if spend >= self._daily_budget_usd:
            raise BudgetExceeded(
                f"daily LLM spend ${spend:.2f} >= budget ${self._daily_budget_usd:.2f}"
            )

        last_exc: BaseException | None = None
        async with self._semaphore:
            for attempt in range(MAX_RETRIES):
                started = time.monotonic()
                try:
                    parsed, in_tok, out_tok = await self._complete(
                        purpose=purpose,
                        model=model,
                        system=system,
                        user=user,
                        response_model=response_model,
                    )
                except Exception as exc:  # noqa: BLE001 - classify then re-raise
                    latency = int((time.monotonic() - started) * 1000)
                    if self._is_retryable(exc) and attempt < MAX_RETRIES - 1:
                        last_exc = exc
                        await asyncio.sleep(BASE_BACKOFF_SECONDS * (2**attempt))
                        continue
                    await self._record(
                        purpose=purpose,
                        model=model,
                        input_tokens=0,
                        output_tokens=0,
                        latency_ms=latency,
                        ok=False,
                        error=str(exc),
                    )
                    raise
                latency = int((time.monotonic() - started) * 1000)
                await self._record(
                    purpose=purpose,
                    model=model,
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                    latency_ms=latency,
                    ok=True,
                    error=None,
                )
                return parsed
        # Only reachable if every attempt was retryable and exhausted.
        assert last_exc is not None
        raise last_exc


def _tool_schema(response_model: type[BaseModel]) -> dict[str, Any]:
    """Build a tool definition whose input schema is the response model's schema."""

    schema = response_model.model_json_schema()
    schema.setdefault("additionalProperties", False)
    return {
        "name": "emit",
        "description": f"Return a well-formed {response_model.__name__} object.",
        "input_schema": schema,
    }


class AnthropicLLMClient(LLMClient):
    """Production client backed by the async Anthropic SDK, using forced tool-use.

    The model can never be reached in this environment (no ``ANTHROPIC_API_KEY``);
    the code is structured for production and unit-tested via monkeypatching. The
    live path is exercised only where credentials exist.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        daily_budget_usd: float | None = None,
        max_concurrency: int | None = None,
        sessionmaker: async_sessionmaker[Any] | None = None,
    ) -> None:
        super().__init__(
            daily_budget_usd=daily_budget_usd,
            max_concurrency=max_concurrency,
            sessionmaker=sessionmaker,
        )
        import anthropic

        settings = get_settings()
        self._client = anthropic.AsyncAnthropic(api_key=api_key or settings.anthropic_api_key)
        self._max_tokens = 2048

    def _is_retryable(self, exc: BaseException) -> bool:
        import anthropic

        if isinstance(exc, anthropic.RateLimitError | anthropic.APIConnectionError):
            return True
        if isinstance(exc, anthropic.APIStatusError):
            return exc.status_code in (429, 529) or exc.status_code >= 500
        return False

    async def _complete(
        self, *, purpose: str, model: str, system: str, user: str, response_model: type[T]
    ) -> tuple[T, int, int]:
        from anthropic.types import (
            MessageParam,
            ToolChoiceToolParam,
            ToolParam,
            ToolUseBlock,
        )

        tool = cast(ToolParam, _tool_schema(response_model))
        tool_choice = cast(ToolChoiceToolParam, {"type": "tool", "name": "emit"})
        messages = [cast(MessageParam, {"role": "user", "content": user})]
        message = await self._client.messages.create(
            model=model,
            max_tokens=self._max_tokens,
            system=system,
            tools=[tool],
            tool_choice=tool_choice,
            messages=messages,
        )
        payload: dict[str, Any] | None = None
        for block in message.content:
            if isinstance(block, ToolUseBlock):
                payload = cast("dict[str, Any]", block.input)
                break
        if payload is None:
            raise ValueError(f"{purpose}: model returned no tool_use block")
        parsed = response_model.model_validate(payload)
        usage = message.usage
        return parsed, int(usage.input_tokens), int(usage.output_tokens)


# Type of the canned-response handler used by the fake client.
FakeResponder = Callable[[str, str, type[BaseModel]], BaseModel | dict[str, Any]]


class FakeLLMClient(LLMClient):
    """Deterministic test double returning canned, schema-valid structured output.

    ``responder`` maps ``(purpose, user, response_model)`` to either a Pydantic
    instance or a dict validated against ``response_model``. It can raise to
    exercise the retry loop; retryable exceptions are those in ``retry_on``.
    """

    def __init__(
        self,
        responder: FakeResponder,
        *,
        retry_on: tuple[type[BaseException], ...] = (),
        input_tokens: int = 100,
        output_tokens: int = 40,
        daily_budget_usd: float | None = None,
        max_concurrency: int | None = None,
        sessionmaker: async_sessionmaker[Any] | None = None,
    ) -> None:
        super().__init__(
            daily_budget_usd=daily_budget_usd,
            max_concurrency=max_concurrency,
            sessionmaker=sessionmaker,
        )
        self._responder = responder
        self._retry_on = retry_on
        self._input_tokens = input_tokens
        self._output_tokens = output_tokens

    def _is_retryable(self, exc: BaseException) -> bool:
        return isinstance(exc, self._retry_on)

    async def _complete(
        self, *, purpose: str, model: str, system: str, user: str, response_model: type[T]
    ) -> tuple[T, int, int]:
        result = self._responder(purpose, user, response_model)
        if isinstance(result, response_model):
            parsed = result
        else:
            parsed = response_model.model_validate(result)
        return parsed, self._input_tokens, self._output_tokens


def default_llm_client() -> LLMClient:
    """Build the production Anthropic client from settings."""

    return AnthropicLLMClient()
