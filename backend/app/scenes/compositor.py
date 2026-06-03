"""Scenes & backgrounds (Milestone 4).

Generates/selects a background by theme + aesthetic (from strategy) and
composites the persona into it. Critically, the composited output is a NEW
emitted asset and is therefore **re-stamped** with provenance + a visible label
via ``GenerationService`` — compositing never produces an undisclosed asset.

This stub picks a background color by theme and delegates emission to
``GenerationService`` so the disclosure guarantee is inherited, not re-derived.
"""
from __future__ import annotations

import hashlib

from app.generation.service import GenerationService
from app.models.asset import AssetKind


def _theme_color(theme: str) -> list[int]:
    h = hashlib.sha256(theme.encode()).digest()
    return [h[0], h[1], h[2]]


class SceneCompositor:
    def __init__(self, generation_service: GenerationService):
        self.generation = generation_service

    def compose(self, *, persona_id, theme: str, aesthetic: str = "default", seed: int | None = None):
        """Compose persona into a themed scene and emit a disclosed asset."""
        prompt = f"persona in scene; theme={theme}; aesthetic={aesthetic}"
        # Re-stamp happens inside GenerationService.generate_asset (C1).
        return self.generation.generate_asset(
            persona_id=persona_id, prompt=prompt, kind=AssetKind.IMAGE, seed=seed
        )
