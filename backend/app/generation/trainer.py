"""Persona trainers — learn a persona's likeness from uploaded reference images.

A trainer takes a set of reference images and produces a model reference (e.g. a
KREA trained-model id or a LoRA adapter URI) that generation can then condition
on for a consistent character. Concrete trainers stay behind this interface so
the model backend is swappable.

Training is only invoked after the C4 non-impersonation attestation passes (see
``app/generation/training_service.py``) — trainers themselves assume the dataset
is already authorized.
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.config import get_settings


@dataclass
class TrainResult:
    model_ref: str          # id/URI generation will reference (lora_model.weights_uri)
    base_model: str
    meta: dict = field(default_factory=dict)


class PersonaTrainer(ABC):
    name: str = "abstract"

    @abstractmethod
    def train(self, *, persona_id: str, image_paths: list[str], base_model: str, meta: dict) -> TrainResult:
        raise NotImplementedError


class StubPersonaTrainer(PersonaTrainer):
    """Deterministic, network-free trainer for dev/demo.

    Produces a stable model reference derived from the dataset so the full
    upload → train → generate → distribute flow is exercisable without a GPU or
    an external service.
    """

    name = "stub-trainer"

    def train(self, *, persona_id, image_paths, base_model, meta) -> TrainResult:
        h = hashlib.sha256()
        for p in sorted(image_paths):
            h.update(p.encode())
        digest = h.hexdigest()[:12]
        return TrainResult(
            model_ref=f"stub-lora:{persona_id}:{digest}",
            base_model=base_model,
            meta={"num_images": len(image_paths), "stub": True, **meta},
        )


def get_trainer() -> PersonaTrainer:
    settings = get_settings()
    if settings.generation_provider.lower() == "krea" and settings.krea_api_key:
        from app.generation.krea_trainer import KreaPersonaTrainer

        return KreaPersonaTrainer()
    return StubPersonaTrainer()
