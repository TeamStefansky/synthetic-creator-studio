"""Heuristic anomaly rules. Importing this package registers every rule."""

from __future__ import annotations

# Import rule modules for their registration side effects.
from . import rules  # noqa: E402,F401
from .base import (
    HEURISTIC_REGISTRY,
    Heuristic,
    iter_heuristics,
    register_heuristic,
    run_heuristics,
)

__all__ = [
    "HEURISTIC_REGISTRY",
    "Heuristic",
    "iter_heuristics",
    "register_heuristic",
    "run_heuristics",
]
