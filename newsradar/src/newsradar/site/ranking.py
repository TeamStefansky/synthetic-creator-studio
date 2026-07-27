"""``personal_score`` — the deterministic reader ranking (P6).

A pure function of a story's features (no randomness, no I/O), so building the
same edition from the same data and a frozen clock is bit-for-bit reproducible.
The score is ``100 * sigmoid(Σ wᵢ·componentᵢ)`` over five normalised components
(see :mod:`newsradar.site.weights`); each component and the final score are
explained verbatim by the item's ``reason`` string.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from newsradar.config import get_settings
from newsradar.signals.math import clamp, sigmoid
from newsradar.site import weights as w


@dataclass(frozen=True)
class StoryFeatures:
    """The features ``personal_score`` needs for one candidate story."""

    interest_affinity_raw: float  # max interest match_score across the user's interests
    source_count: int  # distinct sources of the story's event (1 for a document)
    source_tier: int | None  # representative source tier (1-4)
    credibility_score: float  # representative source credibility (0-1)
    heat_score: float  # events.heat_score (0 for singletons)
    published_at: dt.datetime | None  # representative publish time


def _recency(published_at: dt.datetime | None, now: dt.datetime, halflife_hours: float) -> float:
    """Exponential decay by publish age, half-life ``halflife_hours``; 0 if unknown."""

    if published_at is None or halflife_hours <= 0:
        return 0.0
    age_hours = (now - published_at).total_seconds() / 3600.0
    if age_hours <= 0:
        return 1.0
    return float(0.5 ** (age_hours / halflife_hours))


def _tier_component(tier: int | None) -> float:
    """Map a source tier (1 best .. 4 worst) onto [0.25, 1.0]; unknown -> 0.5."""

    if tier is None:
        return 0.5
    return clamp((5 - tier) / 4.0)


def components(
    features: StoryFeatures, *, now: dt.datetime, halflife_hours: float
) -> dict[str, float]:
    """Return each normalised ranking component in [0, 1] (deterministic)."""

    affinity = clamp(features.interest_affinity_raw / w.AFFINITY_NORM_DENOM)
    recency = _recency(features.published_at, now, halflife_hours)
    corroboration = clamp(features.source_count / w.CORROBORATION_NORM_DENOM)
    trust = clamp(
        w.TRUST_TIER_WEIGHT * _tier_component(features.source_tier)
        + w.TRUST_CREDIBILITY_WEIGHT * clamp(features.credibility_score)
    )
    heat = clamp(features.heat_score / w.HEAT_NORM_DENOM)
    return {
        "interest_affinity": affinity,
        "recency": recency,
        "corroboration": corroboration,
        "source_trust": trust,
        "heat": heat,
    }


def personal_score(
    features: StoryFeatures, *, now: dt.datetime, halflife_hours: float | None = None
) -> float:
    """The 0-100 reader score for one story. Deterministic; no randomness."""

    if halflife_hours is None:
        halflife_hours = get_settings().edition_recency_halflife_hours
    comps = components(features, now=now, halflife_hours=halflife_hours)
    weighted = sum(w.RANKING_WEIGHTS[name] * value for name, value in comps.items())
    shaped = sigmoid(w.SCORE_SIGMOID_GAIN * (weighted - w.SCORE_SIGMOID_CENTER))
    return round(100.0 * shaped, 4)
