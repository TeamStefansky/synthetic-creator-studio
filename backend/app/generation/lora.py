"""Per-persona LoRA training/registration flow (Milestone 3).

Real training is a GPU job dispatched to a Celery worker. Here we provide the
registration/versioning surface so personas can own versioned adapters and
generation can request a specific version. ``train`` is a stub that registers a
new version record; ``register`` records an externally trained adapter.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.lora_model import LoraModel


class LoraRegistry:
    def __init__(self, session: Session):
        self.session = session

    def _next_version(self, persona_id) -> str:
        count = (
            self.session.query(LoraModel).filter(LoraModel.persona_id == persona_id).count()
        )
        return f"v{count + 1}"

    def register(
        self,
        *,
        persona_id,
        base_model: str,
        weights_uri: str | None = None,
        training_meta: dict | None = None,
        version: str | None = None,
    ) -> LoraModel:
        model = LoraModel(
            persona_id=persona_id,
            version=version or self._next_version(persona_id),
            base_model=base_model,
            weights_uri=weights_uri,
            training_meta=training_meta or {},
            status="registered",
        )
        self.session.add(model)
        self.session.flush()
        return model

    def train(self, *, persona_id, base_model: str, dataset_uri: str, **meta) -> LoraModel:
        """Stub training entrypoint. In prod this enqueues a Celery GPU job and
        returns a ``status='training'`` record updated on completion."""
        return self.register(
            persona_id=persona_id,
            base_model=base_model,
            training_meta={"dataset_uri": dataset_uri, "stub": True, **meta},
        )
