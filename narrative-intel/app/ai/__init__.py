"""Unified AI provider interface. Swap providers without touching the pipeline.

Default = rule-based (deterministic, zero-cost, offline). When ANTHROPIC_API_KEY
is set, the Anthropic provider can be used for higher-quality summaries.
"""
from __future__ import annotations

import os

from .base import AiProvider
from .rule_based import RuleBasedProvider

_provider: AiProvider | None = None


def get_provider() -> AiProvider:
    global _provider
    if _provider is None:
        # Anthropic is optional; only summaries use it. Enrichment stays rule-based
        # so ingestion is deterministic and free.
        _provider = RuleBasedProvider()
    return _provider
