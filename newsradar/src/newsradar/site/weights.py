"""The reader ranking weights — one documented, versioned home (P6).

The reader front page has no learned ranking, no A/B tests and no click feedback
(a hard non-goal): ``personal_score`` is a fixed weighted sum of five normalised
components, passed through a logistic to land on 0-100. Everything here is a
hand-set constant so ranking is deterministic and explainable — the ``reason``
string on every edition item narrates exactly these components.
"""

from __future__ import annotations

from typing import Final

# Provenance handle for "which weight set produced this ranking".
READER_WEIGHTS_VERSION: Final[str] = "2026-07-27.1"

# personal_score = 100 * sigmoid( Σ w_i * component_i ). Weights sum to 1.0.
#   interest_affinity — max interest match_score for the story (keyword > semantic)
#   recency           — exponential decay by publish age (half-life from settings)
#   corroboration     — normalised distinct-source count of the story's event
#   source_trust      — source tier + credibility of the representative source
#   heat              — events.heat_score (0 for singleton documents)
RANKING_WEIGHTS: Final[dict[str, float]] = {
    "interest_affinity": 0.30,
    "recency": 0.25,
    "corroboration": 0.20,
    "source_trust": 0.15,
    "heat": 0.10,
}

# --- component normalisation ---------------------------------------------------------

# interest_match score is 1.0 + keyword_score (keyword hits, ~1.0-2.0) or a raw
# cosine similarity (semantic-only, 0.0-1.0). Dividing by this keeps keyword hits
# above semantic-only ones while mapping onto ~[0, 1].
AFFINITY_NORM_DENOM: Final[float] = 2.0

# distinct sources for full corroboration (10 outlets = a thoroughly covered story).
CORROBORATION_NORM_DENOM: Final[float] = 10.0

# source_trust blends the tier (mapped 1->1.0 .. 4->0.25) with credibility_score.
TRUST_TIER_WEIGHT: Final[float] = 0.5
TRUST_CREDIBILITY_WEIGHT: Final[float] = 0.5

# events.heat_score is already 0-100; divide to map onto [0, 1].
HEAT_NORM_DENOM: Final[float] = 100.0

# Logistic shaping so a mid-range weighted sum (~0.5) maps near 50/100 rather than
# the flat ~0.62 of a raw logistic.
SCORE_SIGMOID_GAIN: Final[float] = 6.0
SCORE_SIGMOID_CENTER: Final[float] = 0.5
