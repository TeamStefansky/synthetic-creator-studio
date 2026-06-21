"""GenerationProvider — swappable engine interface (Milestone 3).

The real implementation wraps a diffusion pipeline (``diffusers``) with a
per-persona LoRA adapter on GPU. Anything heavier than this interface stays
behind it, so the rest of the app — and the disclosure pipeline in particular —
never depends on the concrete model.

Crucially, a provider only produces *raw* bytes. It is **not** allowed to be
the thing that emits a publishable asset: provenance stamping + visible
labeling happen in ``GenerationService`` so C1 cannot be bypassed by swapping
providers.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.models.asset import AssetKind


@dataclass
class GenerationRequest:
    persona_id: str
    prompt: str
    kind: AssetKind = AssetKind.IMAGE
    negative_prompt: str | None = None
    lora_version: str | None = None
    # Trained-model reference (e.g. a KREA trained-model id or LoRA URI) the
    # provider should condition on for this persona's learned likeness.
    model_ref: str | None = None
    width: int = 512
    height: int = 512
    seed: int | None = None
    # The persona's stored visual identity, forwarded for conditioning + QC.
    visual_identity: dict | None = None
    extra: dict = field(default_factory=dict)


@dataclass
class GenerationResult:
    kind: AssetKind
    content: bytes
    fmt: str = "PNG"  # PNG|JPEG|MP4|TXT
    meta: dict = field(default_factory=dict)


class GenerationProvider(ABC):
    """Concrete providers implement ``generate`` only."""

    name: str = "abstract"

    @abstractmethod
    def generate(self, request: GenerationRequest) -> GenerationResult:
        """Produce raw (unlabeled, unstamped) asset bytes."""
        raise NotImplementedError
