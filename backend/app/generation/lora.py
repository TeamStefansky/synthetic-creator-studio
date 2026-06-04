"""Per-persona LoRA training/registration flow (Milestone 3).

Real training is a GPU job dispatched to a Celery worker. This module provides:
- the registration/versioning surface (``LoraRegistry``), and
- a training entrypoint (``run_training``) that real workers call to perform the
  GPU job and transition the adapter's status, with a deterministic stub used
  when torch/diffusers are unavailable so the lifecycle is testable end-to-end.

Status lifecycle: ``queued`` → ``training`` → ``ready`` (or ``failed``).
Generation requests reference a specific ``ready`` version by ``lora_version``.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.lora_model import LoraModel


class LoraRegistry:
    def __init__(self, session: Session):
        self.session = session

    def _next_version(self, persona_id) -> str:
        count = self.session.query(LoraModel).filter(LoraModel.persona_id == persona_id).count()
        return f"v{count + 1}"

    def register(
        self,
        *,
        persona_id,
        base_model: str,
        weights_uri: str | None = None,
        training_meta: dict | None = None,
        version: str | None = None,
        status: str = "registered",
    ) -> LoraModel:
        model = LoraModel(
            persona_id=persona_id,
            version=version or self._next_version(persona_id),
            base_model=base_model,
            weights_uri=weights_uri,
            training_meta=training_meta or {},
            status=status,
        )
        self.session.add(model)
        self.session.flush()
        return model

    def create_training_job(
        self, *, persona_id, base_model: str, dataset_uri: str, **meta
    ) -> LoraModel:
        """Create a queued adapter version for a persona. Enqueue ``run_training``
        (via Celery in prod) with the returned id."""
        return self.register(
            persona_id=persona_id,
            base_model=base_model,
            training_meta={"dataset_uri": dataset_uri, **meta},
            status="queued",
        )


def run_training(session: Session, lora_model_id) -> LoraModel:
    """Execute (or stub) the LoRA training job and update its status.

    Real path: load the base model, train the adapter on the persona's dataset,
    push weights to object storage. Stub path (no GPU): mark as ready with a
    deterministic artifact pointer so the lifecycle + generation wiring are
    exercisable. Failures are recorded as ``failed`` (fail-closed for callers).
    """
    model = session.get(LoraModel, lora_model_id)
    if model is None:
        raise ValueError(f"lora_model {lora_model_id} not found")

    model.status = "training"
    session.flush()

    try:
        from app.generation.diffusion_provider import diffusion_available

        if diffusion_available():  # pragma: no cover - requires GPU stack
            weights_uri = _train_with_diffusers(session, model)
        else:
            # Deterministic stub artifact under object storage.
            storage = get_settings().storage_dir
            weights_uri = str(storage / f"lora_{model.persona_id}_{model.version}.safetensors")
            meta = dict(model.training_meta or {})
            meta["stub"] = True
            model.training_meta = meta

        model.weights_uri = weights_uri
        model.status = "ready"
        session.flush()
        return model
    except Exception as exc:  # fail closed — never leave a half-trained adapter "ready"
        model.status = "failed"
        meta = dict(model.training_meta or {})
        meta["error"] = str(exc)
        model.training_meta = meta
        session.flush()
        raise


def _train_with_diffusers(session: Session, model: LoraModel) -> str:  # pragma: no cover
    """Real GPU training entrypoint (requires torch/diffusers + a dataset)."""
    raise NotImplementedError(
        "wire to a diffusers LoRA trainer (e.g. PEFT/kohya) on a GPU worker"
    )
