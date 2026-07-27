"""The metric-correctness gate: exactly one spike, zero false positives.

A synthetic 14-day (336-hour) timeline carries three traps that a naive detector
would flag, plus one genuine 5x spike:

* Trap A — a long quiet run (all zeros) followed by a small blip. A pure z-score
  detector fires here (0 variance -> huge z); the absolute-count floor must veto it.
* Trap B — an hour that is busy but *normal for its hour-of-week* (its seasonal
  baseline is high). The seasonal-baseline factor must veto it.
* The real spike — a genuine multiple of the surrounding volume.

The detector must return exactly the real spike. Do not weaken this test; if it
fails, fix the algorithm.
"""

from __future__ import annotations

import datetime as dt

from newsradar.signals import weights as w
from newsradar.signals.baseline import SeasonalBaseline, hour_of_week
from newsradar.signals.velocity import buckets_from_counts, detect_spikes

TZ = "Asia/Jerusalem"
START = dt.datetime(2026, 6, 1, 0, 0, tzinfo=dt.UTC)
N_HOURS = 24 * 14

BASE = 2  # ordinary hourly volume for this event
TRAP_A_INDEX = 130  # quiet-then-blip
TRAP_B_INDEX = 200  # seasonally-busy-but-normal
SPIKE_INDEX = 250  # the genuine spike


def _timeline() -> tuple[list[dt.datetime], list[int]]:
    times = [START + dt.timedelta(hours=i) for i in range(N_HOURS)]
    counts = [BASE] * N_HOURS

    # Trap A: 30 hours of zero, then a blip of 4 (below the absolute-count floor).
    for i in range(TRAP_A_INDEX - 30, TRAP_A_INDEX):
        counts[i] = 0
    counts[TRAP_A_INDEX] = 4

    # Trap B: a busy-but-seasonally-normal hour (count 6, its slot baseline is 5).
    counts[TRAP_B_INDEX] = 6

    # The genuine spike: ~10x the surrounding volume.
    counts[SPIKE_INDEX] = 20
    return times, counts


def _seasonal_baseline(times: list[dt.datetime]) -> SeasonalBaseline:
    # Only Trap B's slot is seasonally busy; everything else defaults to ~ambient.
    means: dict[int, float] = {}
    means[hour_of_week(times[TRAP_B_INDEX], TZ)] = 5.0
    return SeasonalBaseline(means=means, tz=TZ)


def test_exactly_one_spike_zero_false_positives() -> None:
    times, counts = _timeline()
    series = buckets_from_counts(times, counts)
    baseline = _seasonal_baseline(times)

    spikes = detect_spikes(series, expected_at=baseline.expected_for)

    assert len(spikes) == 1
    assert spikes[0].bucket_at == times[SPIKE_INDEX]
    assert spikes[0].acceleration is not None and spikes[0].acceleration >= w.SPIKE_Z


def test_traps_individually_vetoed() -> None:
    times, counts = _timeline()
    series = buckets_from_counts(times, counts)
    by_time = {b.bucket_at: b for b in series}

    # Trap A: high z (post-zero-run) but count below the floor -> not a spike.
    trap_a = by_time[times[TRAP_A_INDEX]]
    assert trap_a.acceleration is not None and trap_a.acceleration >= w.SPIKE_Z
    assert trap_a.doc_count < w.SPIKE_MIN_COUNT

    # Trap B: above the count floor and high z, but within its seasonal norm.
    trap_b = by_time[times[TRAP_B_INDEX]]
    assert trap_b.doc_count >= w.SPIKE_MIN_COUNT
    baseline = _seasonal_baseline(times)
    expected = baseline.expected_for(trap_b.bucket_at)
    assert trap_b.doc_count < w.SPIKE_BASELINE_FACTOR * max(expected, 1.0)

    # With no seasonal baseline, Trap B would still be vetoed only if the count
    # floor caught it — it does not, so the seasonal guard is doing real work:
    # without it Trap B leaks through.
    no_baseline = detect_spikes(series)
    assert times[TRAP_B_INDEX] in {b.bucket_at for b in no_baseline}
    assert times[SPIKE_INDEX] in {b.bucket_at for b in no_baseline}


def test_acceleration_none_before_min_buckets() -> None:
    times, counts = _timeline()
    series = buckets_from_counts(times, counts)
    for b in series[: w.ACCEL_MIN_BUCKETS]:
        assert b.acceleration is None
    assert series[w.ACCEL_MIN_BUCKETS].acceleration is not None
