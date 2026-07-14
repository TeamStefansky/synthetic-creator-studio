"""Artifact extractors. Importing this package registers every extractor."""

from __future__ import annotations

# Import extractor modules for their registration side effects.
from . import (  # noqa: E402,F401
    analytics,
    apps,
    crashlogs,
    datausage,
    profiles,
    safari,
    sms,
    sysdiagnose,
    tcc,
)
from .base import (
    EXTRACTOR_REGISTRY,
    ExtractionContext,
    Extractor,
    iter_extractors,
    register_extractor,
)

__all__ = [
    "EXTRACTOR_REGISTRY",
    "ExtractionContext",
    "Extractor",
    "iter_extractors",
    "register_extractor",
]
