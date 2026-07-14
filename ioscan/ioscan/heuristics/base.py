"""Heuristic rule protocol and registry.

A heuristic inspects the full set of extracted records and emits Detections for
anomalies that are not tied to a specific known IOC (odd process names, risky
crash signatures, unexpected config profiles, jailbreak traces, ...).

Adding a rule = implement ``Heuristic`` and decorate with ``@register_heuristic``.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Protocol, runtime_checkable

from ..models import Detection, Record


@runtime_checkable
class Heuristic(Protocol):
    name: str
    scan_types: tuple[str, ...]

    def evaluate(self, records: Sequence[Record]) -> Iterator[Detection]: ...


HEURISTIC_REGISTRY: list[type] = []


def register_heuristic(cls: type) -> type:
    HEURISTIC_REGISTRY.append(cls)
    return cls


def iter_heuristics(scan_type: str) -> Iterator[Heuristic]:
    for cls in HEURISTIC_REGISTRY:
        inst = cls()
        if scan_type in getattr(inst, "scan_types", ()):
            yield inst


def run_heuristics(records: Sequence[Record], scan_type: str) -> Iterator[Detection]:
    for rule in iter_heuristics(scan_type):
        yield from rule.evaluate(records)
