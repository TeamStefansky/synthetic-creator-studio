"""Single, documented, versioned home for every hand-set signal constant.

The spec forbids ML-learned ranking or A/B testing of weights: these are
hand-tuned constants. Keeping them in one place (with a version string that is
stamped onto nothing yet but is available for provenance) means "one place to
tune". Nothing in :mod:`newsradar.signals` hardcodes a threshold — it is imported
from here.

The numbers below are deliberately conservative to satisfy the two hard quality
gates:

* Spike detection must produce **zero false positives** on a noisy 14-day
  baseline. That is why a spike requires *all three* of: a z-score at or above
  :data:`SPIKE_Z`, an absolute count at or above :data:`SPIKE_MIN_COUNT`
  (so a 0->1 blip cannot spike), and the count exceeding the seasonal baseline by
  :data:`SPIKE_BASELINE_FACTOR` (so a "busy hour that is normal for this
  hour-of-week" does not spike).
* Entity-targeted negativity must not track raw document sentiment — enforced in
  :mod:`newsradar.signals.negativity`, not here, but the tier weights it uses live
  here.
"""

from __future__ import annotations

from typing import Final

# Bump this whenever any constant below changes; it is the provenance handle for
# "which weight set produced this score".
WEIGHTS_VERSION: Final[str] = "2026-07-27.1"

# --------------------------------------------------------------------------------------
# Source-tier weights (source diversity > raw volume — a core domain rule).
# A tier-1 outlet's coverage counts more than a tier-4 aggregator's.
# --------------------------------------------------------------------------------------
TIER_WEIGHTS: Final[dict[int, float]] = {1: 2.0, 2: 1.5, 3: 1.0, 4: 0.5}
DEFAULT_TIER_WEIGHT: Final[float] = 1.0


def tier_weight(tier: int | None) -> float:
    """Weight for a source tier, defaulting to :data:`DEFAULT_TIER_WEIGHT`."""

    if tier is None:
        return DEFAULT_TIER_WEIGHT
    return TIER_WEIGHTS.get(tier, DEFAULT_TIER_WEIGHT)


# --------------------------------------------------------------------------------------
# heat_score composite weights (must sum to 1.0). See signals/scoring.py.
#   heat = 100 * sigmoid( Σ w_i * norm(component_i) )
# --------------------------------------------------------------------------------------
HEAT_WEIGHTS: Final[dict[str, float]] = {
    "acceleration": 0.35,
    "source_diversity": 0.25,
    "velocity": 0.20,
    "cross_platform_lift": 0.10,
    "tier1_share": 0.10,
}

# Normalisation denominators mapping an unbounded component onto ~[0, 1] before
# the weighted sum. norm(x) = clamp(x / denom, 0, 1). Chosen so a "strong but
# realistic" value lands near 1.0.
ACCEL_NORM_DENOM: Final[float] = 6.0  # a z-score of 6 is a very sharp acceleration
VELOCITY_NORM_DENOM: Final[float] = 20.0  # 20 docs/hour is a very hot event
# The sigmoid is steepened and centred so that a mid-range weighted sum (~0.5)
# maps near 50/100 rather than the flat ~0.62 of a raw logistic.
HEAT_SIGMOID_GAIN: Final[float] = 6.0
HEAT_SIGMOID_CENTER: Final[float] = 0.5

# --------------------------------------------------------------------------------------
# Velocity / acceleration (signals/velocity.py)
# --------------------------------------------------------------------------------------
# Trailing window (in hourly buckets) used for the acceleration z-score.
ACCEL_TRAILING_BUCKETS: Final[int] = 24
# Minimum trailing buckets required before any z-score is emitted (else NULL).
ACCEL_MIN_BUCKETS: Final[int] = 6
# A stdev floor so a near-constant trailing window cannot manufacture a huge z
# from a one-document wobble (a classic false-positive source).
ACCEL_STDEV_FLOOR: Final[float] = 1.0

# --------------------------------------------------------------------------------------
# Spike detection (signals/velocity.py detect_spikes) — the no-false-positive gate.
# --------------------------------------------------------------------------------------
SPIKE_Z: Final[float] = 3.0
SPIKE_MIN_COUNT: Final[int] = 5
SPIKE_BASELINE_FACTOR: Final[float] = 2.0

# --------------------------------------------------------------------------------------
# Seasonal baseline (signals/baseline.py)
# --------------------------------------------------------------------------------------
BASELINE_WEEKS: Final[int] = 4
HOURS_PER_WEEK: Final[int] = 168

# --------------------------------------------------------------------------------------
# Geo hot zones (signals/geo.py)
# --------------------------------------------------------------------------------------
H3_RESOLUTION: Final[int] = 4
GEO_WINDOW_HOURS: Final[int] = 6
GEO_BASELINE_DAYS: Final[int] = 14
GEO_HOT_Z: Final[float] = 3.0
GEO_HOT_MIN_COUNT: Final[int] = 3

# --------------------------------------------------------------------------------------
# Negativity (signals/negativity.py). Defaults coalesce missing per-document
# weights so a single NULL does not zero out the weighted average.
# --------------------------------------------------------------------------------------
NEG_DEFAULT_CONFIDENCE: Final[float] = 0.5
NEG_DEFAULT_PROMINENCE: Final[float] = 0.5

# --------------------------------------------------------------------------------------
# Trends (signals/trends.py)
# --------------------------------------------------------------------------------------
TREND_MIN_LIFT: Final[float] = 2.0
TREND_MIN_DOCS: Final[int] = 8
TREND_MIN_SOURCES: Final[int] = 4

# --------------------------------------------------------------------------------------
# Alert rules (signals/rules.py)
# --------------------------------------------------------------------------------------
HEAT_WARNING: Final[float] = 70.0
HEAT_CRITICAL: Final[float] = 85.0
NEG_SURGE_MIN_DOCS: Final[int] = 5
NEG_SURGE_WINDOW_HOURS: Final[int] = 3
NEG_SURGE_MIN_INDEX: Final[float] = 0.6
NEW_TREND_MIN_LIFT: Final[float] = 3.0
ALERT_COOLDOWN_HOURS: Final[int] = 6

# Cross-platform lift (signals/scoring.py): the max gap between two distinct
# source_types that still counts as a "cross-over".
CROSS_PLATFORM_WINDOW_HOURS: Final[float] = 6.0
