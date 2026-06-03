"""Provider selection — diffusion in production, stub otherwise.

Honors ``SCS_GENERATION_PROVIDER`` ("diffusion"|"stub"). When "diffusion" is
requested but torch/diffusers are unavailable, we fail closed rather than
silently degrading — unless ``allow_fallback`` is set, which downgrades to the
stub with no pretense of being the real model.
"""
from __future__ import annotations

from app.config import get_settings
from app.generation.provider import GenerationProvider
from app.generation.stub_provider import StubGenerationProvider


def get_provider(name: str | None = None, *, allow_fallback: bool = True) -> GenerationProvider:
    choice = (name or get_settings().generation_provider).lower()
    if choice == "diffusion":
        from app.generation.diffusion_provider import (
            DiffusionGenerationProvider,
            diffusion_available,
        )

        if diffusion_available():
            return DiffusionGenerationProvider()
        if not allow_fallback:
            from app.constraints import StudioError

            raise StudioError(
                "generation_provider='diffusion' requested but torch/diffusers unavailable"
            )
    return StubGenerationProvider()
