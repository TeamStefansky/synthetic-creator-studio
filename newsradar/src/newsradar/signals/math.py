"""Pure math helpers for the signal engine — sigmoid, z-score, entropy, norms.

No numpy gymnastics inline elsewhere: every bit of scoring arithmetic that is not
a plain weighted sum lives here and is unit-tested directly. Everything is a pure
function of its arguments (no I/O, no globals) so the scoring math is trivially
testable and deterministic.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Clamp ``x`` into ``[lo, hi]``."""

    return max(lo, min(hi, x))


def sigmoid(x: float) -> float:
    """Numerically stable logistic sigmoid, returning a value in (0, 1)."""

    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def zscore(value: float, mean: float, stdev: float, *, stdev_floor: float = 0.0) -> float:
    """Z-score of ``value`` against a distribution ``(mean, stdev)``.

    ``stdev`` is floored at ``stdev_floor`` so a degenerate (near-zero variance)
    trailing window cannot turn a one-unit wobble into an enormous z-score — the
    key guard against spike false positives. With an effective stdev of zero and
    ``value == mean`` the z-score is 0.
    """

    effective = max(stdev, stdev_floor)
    if effective <= 0.0:
        return 0.0
    return (value - mean) / effective


@dataclass
class Welford:
    """Online mean/variance accumulator (Welford's algorithm).

    Used for the trailing-window statistics behind acceleration so we never hold
    a whole window in memory or recompute from scratch per bucket.
    """

    n: int = 0
    mean: float = 0.0
    m2: float = 0.0

    def add(self, x: float) -> None:
        """Fold one observation into the running statistics."""

        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        self.m2 += delta * (x - self.mean)

    @property
    def variance(self) -> float:
        """Sample variance (n-1 denominator); 0 for fewer than two observations."""

        if self.n < 2:
            return 0.0
        return self.m2 / (self.n - 1)

    @property
    def stdev(self) -> float:
        """Sample standard deviation."""

        return math.sqrt(self.variance)


def welford_stats(values: Iterable[float]) -> tuple[int, float, float]:
    """Return ``(n, mean, stdev)`` for ``values`` using :class:`Welford`."""

    acc = Welford()
    for v in values:
        acc.add(v)
    return acc.n, acc.mean, acc.stdev


def normalized_shannon_entropy(weights: Sequence[float]) -> float:
    """Shannon entropy of a weight distribution, normalised to ``[0, 1]``.

    ``weights`` are non-negative per-category masses (e.g. tier-weighted document
    counts per source). Returns ``H / log(k)`` where ``k`` is the number of
    positive-mass categories, so a perfectly even spread over ``k`` sources is 1.0
    and a single source is 0.0. Empty or single-category input is 0.0.
    """

    positive = [w for w in weights if w > 0.0]
    k = len(positive)
    if k <= 1:
        return 0.0
    total = sum(positive)
    entropy = 0.0
    for w in positive:
        p = w / total
        entropy -= p * math.log(p)
    return clamp(entropy / math.log(k))


def norm_linear(x: float, denom: float) -> float:
    """Map ``x`` onto ``[0, 1]`` as ``clamp(x / denom, 0, 1)``."""

    if denom <= 0.0:
        return 0.0
    return clamp(x / denom)
