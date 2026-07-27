"""Unit tests for the LLM client: token accounting, budget guard, retry.

These use :class:`FakeLLMClient` — the same base class, budget guard, retry loop
and ``llm_calls`` accounting the production client uses, with a canned responder
in place of a live API. ``ANTHROPIC_API_KEY`` is absent in this environment, so
the live Anthropic path is not (and cannot be) exercised here.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import LlmCall
from newsradar.llm.client import BudgetExceeded, FakeLLMClient, estimated_cost_usd
from newsradar.llm.schemas import EventSummaryOut


async def _reset(session: AsyncSession) -> None:
    await session.execute(text("TRUNCATE llm_calls"))
    await session.commit()


def _summary_responder(purpose: str, user: str, model: type) -> EventSummaryOut:
    return EventSummaryOut(title="A concise title", summary="One. Two. Three.")


@pytest.mark.asyncio
async def test_successful_call_writes_token_accounting(session: AsyncSession) -> None:
    await _reset(session)
    client = FakeLLMClient(_summary_responder, input_tokens=123, output_tokens=45)

    out = await client.generate_structured(
        purpose="event_summary",
        model="claude-sonnet-5",
        system="s",
        user="u",
        response_model=EventSummaryOut,
    )
    assert out.title == "A concise title"

    rows = (await session.execute(select(LlmCall))).scalars().all()
    assert len(rows) == 1
    assert rows[0].purpose == "event_summary"
    assert rows[0].model == "claude-sonnet-5"
    assert rows[0].input_tokens == 123
    assert rows[0].output_tokens == 45
    assert rows[0].ok is True


@pytest.mark.asyncio
async def test_budget_exceeded_blocks_before_call(session: AsyncSession) -> None:
    await _reset(session)
    # Pre-load spend that already exceeds a tiny budget.
    session.add(
        LlmCall(
            purpose="enrich_entities",
            model="claude-sonnet-5",
            input_tokens=10_000_000,
            output_tokens=1_000_000,
            ok=True,
            created_at=dt.datetime.now(dt.UTC),
        )
    )
    await session.commit()

    client = FakeLLMClient(_summary_responder, daily_budget_usd=1.0)
    with pytest.raises(BudgetExceeded):
        await client.generate_structured(
            purpose="event_summary",
            model="claude-sonnet-5",
            system="s",
            user="u",
            response_model=EventSummaryOut,
        )
    # No new call row was written (the guard fired before _complete).
    count = (await session.execute(select(func.count()).select_from(LlmCall))).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_retry_then_success_records_one_ok_row(session: AsyncSession) -> None:
    await _reset(session)
    attempts = {"n": 0}

    class TransientError(RuntimeError):
        pass

    def flaky(purpose: str, user: str, model: type) -> EventSummaryOut:
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise TransientError("temporary")
        return EventSummaryOut(title="ok", summary="done.")

    client = FakeLLMClient(flaky, retry_on=(TransientError,))
    out = await client.generate_structured(
        purpose="event_summary",
        model="claude-sonnet-5",
        system="s",
        user="u",
        response_model=EventSummaryOut,
    )
    assert out.title == "ok"
    assert attempts["n"] == 3

    rows = (await session.execute(select(LlmCall))).scalars().all()
    assert len(rows) == 1  # retries are not recorded, only the successful attempt
    assert rows[0].ok is True


@pytest.mark.asyncio
async def test_non_retryable_error_records_failure(session: AsyncSession) -> None:
    await _reset(session)

    def boom(purpose: str, user: str, model: type) -> EventSummaryOut:
        raise ValueError("permanent")

    client = FakeLLMClient(boom)
    with pytest.raises(ValueError, match="permanent"):
        await client.generate_structured(
            purpose="event_summary",
            model="claude-sonnet-5",
            system="s",
            user="u",
            response_model=EventSummaryOut,
        )
    rows = (await session.execute(select(LlmCall))).scalars().all()
    assert len(rows) == 1
    assert rows[0].ok is False
    assert rows[0].error == "permanent"


def test_estimated_cost() -> None:
    # 1M input @ $3 + 1M output @ $15 = $18 for sonnet.
    assert estimated_cost_usd("claude-sonnet-5", 1_000_000, 1_000_000) == pytest.approx(18.0)
