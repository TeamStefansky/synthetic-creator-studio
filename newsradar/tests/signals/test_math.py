"""Unit tests for the pure math helpers."""

from __future__ import annotations

import math

from newsradar.signals.math import (
    Welford,
    clamp,
    norm_linear,
    normalized_shannon_entropy,
    sigmoid,
    welford_stats,
    zscore,
)


def test_sigmoid_monotone_and_bounded() -> None:
    assert sigmoid(0.0) == 0.5
    assert 0.0 < sigmoid(-50.0) < sigmoid(0.0) < sigmoid(50.0) <= 1.0
    # Numerically stable at extremes (no overflow).
    assert sigmoid(1000.0) == 1.0
    assert sigmoid(-1000.0) == 0.0


def test_clamp() -> None:
    assert clamp(-1.0) == 0.0
    assert clamp(2.0) == 1.0
    assert clamp(0.3) == 0.3


def test_zscore_stdev_floor_prevents_blowup() -> None:
    # A degenerate window (all equal) has stdev 0; the floor caps the z-score so a
    # tiny wobble cannot explode. value==mean -> 0 regardless.
    assert zscore(5.0, 5.0, 0.0) == 0.0
    assert zscore(6.0, 5.0, 0.0, stdev_floor=1.0) == 1.0
    # Without a floor and zero stdev we still return 0 (defensive), not inf.
    assert zscore(6.0, 5.0, 0.0) == 0.0


def test_zscore_normal() -> None:
    assert zscore(10.0, 4.0, 2.0) == 3.0


def test_welford_matches_statistics() -> None:
    values = [2.0, 2.0, 3.0, 5.0, 8.0, 13.0]
    n, mean, stdev = welford_stats(values)
    assert n == 6
    assert mean == sum(values) / len(values)
    # Compare to the textbook sample stdev.
    var = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    assert math.isclose(stdev, math.sqrt(var), rel_tol=1e-9)


def test_welford_incremental() -> None:
    acc = Welford()
    assert acc.variance == 0.0
    for v in (1.0,):
        acc.add(v)
    assert acc.variance == 0.0  # single sample


def test_normalized_shannon_entropy() -> None:
    assert normalized_shannon_entropy([]) == 0.0
    assert normalized_shannon_entropy([5.0]) == 0.0
    # Even spread over k categories -> 1.0.
    assert math.isclose(normalized_shannon_entropy([1.0, 1.0, 1.0, 1.0]), 1.0, rel_tol=1e-9)
    # Skewed distribution is strictly between 0 and 1.
    skewed = normalized_shannon_entropy([10.0, 1.0, 1.0])
    assert 0.0 < skewed < 1.0


def test_norm_linear() -> None:
    assert norm_linear(3.0, 6.0) == 0.5
    assert norm_linear(12.0, 6.0) == 1.0
    assert norm_linear(-3.0, 6.0) == 0.0
    assert norm_linear(3.0, 0.0) == 0.0
