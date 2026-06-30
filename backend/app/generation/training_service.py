"""PersonaTrainingService — learn a persona from uploaded images (KREA Train).

Flow: a persona's uploaded ``TrainingImage`` dataset → a trained model the
generation provider conditions on. Enforces the Law:

- C4: training is refused unless the uploader attests the subject is NOT a real
  person's unlicensed likeness (``no_real_person``) and they have the rights
  (``rights_confirmed``). The attestation is stored immutably with the job and
  tied to the persona's accountable entity (C3). Any provided subject text is
  also run through the real-person guard.
- C1: this only trains a model; every *generated* asset still passes through the
  disclosure pipeline (visible label + provenance).

Note: pixel-level real-face detection is out of scope here; the enforced policy
is attestation + accountability + disclosure, with a hook for a likeness
classifier (``_screen_dataset``).
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import get_settings
from app.constraints import Constraint, ConstraintViolation, ImpersonationError, StudioError
from app.generation.lora import LoraRegistry
from app.generation.trainer import PersonaTrainer, get_trainer
from app.models.lora_model import LoraModel
from app.models.persona import Persona
from app.models.training_image import TrainingImage
from app.safety.real_person import RealPersonGuard

MIN_IMAGES = 3


@dataclass
class TrainingAttestation:
    no_real_person: bool          # subject is not a real person's unlicensed likeness
    rights_confirmed: bool        # uploader holds rights to the reference images
    subject_note: str | None = None

    def to_dict(self) -> dict:
        return {
            "no_real_person": self.no_real_person,
            "rights_confirmed": self.rights_confirmed,
            "subject_note": self.subject_note,
        }


class PersonaTrainingService:
    def __init__(self, session: Session, *, trainer: PersonaTrainer | None = None,
                 guard: RealPersonGuard | None = None):
        self.session = session
        self.trainer = trainer or get_trainer()
        self.guard = guard or RealPersonGuard()

    def _assert_attestation(self, attestation: TrainingAttestation, persona: Persona) -> None:
        # C4 — fail closed unless the non-impersonation attestation is affirmed.
        if not attestation.no_real_person:
            raise ImpersonationError(
                Constraint.NO_REAL_PERSON_IMPERSONATION,
                "training refused — uploader did not attest the subject is not a real "
                "person's likeness. This product does not train on real people.",
            )
        if not attestation.rights_confirmed:
            raise ConstraintViolation(
                Constraint.ACCOUNTABLE_ENTITY_REQUIRED,
                "training refused — uploader must confirm rights to the reference images.",
            )
        # Screen any free-text subject note for real-person targeting.
        self.guard.assert_clear(attestation.subject_note, persona.name, context="training subject")

    def _screen_dataset(self, image_paths: list[str]) -> None:
        """Hook for a likeness/real-face classifier. No-op by default; a real
        deployment plugs a detector here to block real-person datasets."""
        return None

    def start_training(
        self,
        *,
        persona_id,
        attestation: TrainingAttestation,
        base_model: str = "flux",
        name: str | None = None,
        optimize_for: str = "style",
        run_inline: bool = True,
    ) -> LoraModel:
        persona = self.session.get(Persona, persona_id)
        if persona is None:
            raise StudioError(f"persona {persona_id} not found")

        self._assert_attestation(attestation, persona)

        images = (
            self.session.query(TrainingImage)
            .filter(TrainingImage.persona_id == persona_id)
            .all()
        )
        if len(images) < MIN_IMAGES:
            raise StudioError(f"need at least {MIN_IMAGES} reference images to train (have {len(images)})")
        self._screen_dataset([i.storage_uri for i in images])

        # KREA fetches reference images by URL → expose them via this backend's
        # public base URL. On Render, RENDER_EXTERNAL_URL is set automatically.
        # Stub training just needs any stable refs (use paths).
        import os

        public = (get_settings().public_base_url or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")
        if public:
            image_refs = [f"{public}/training-images/{i.id}/file" for i in images]
        else:
            image_refs = [i.storage_uri for i in images]

        job = LoraRegistry(self.session).register(
            persona_id=persona_id,
            base_model=base_model,
            training_meta={
                "attestation": attestation.to_dict(),
                "num_images": len(images),
                "name": name or f"{persona.name} ({optimize_for})",
                "optimize_for": optimize_for,
            },
            status="queued",
        )
        if run_inline:
            self._run(job, image_refs, base_model)
        return job

    def _run(self, job: LoraModel, image_refs: list[str], base_model: str) -> LoraModel:
        job.status = "training"
        self.session.flush()
        try:
            result = self.trainer.train(
                persona_id=str(job.persona_id),
                image_paths=image_refs,
                base_model=base_model,
                meta=dict(job.training_meta or {}),
            )
            job.training_meta = {**(job.training_meta or {}), **result.meta}
            if result.pending:
                # Async (KREA): stays "training"; resolved later via refresh().
                job.status = "training"
            else:
                job.weights_uri = result.model_ref
                job.training_meta = {**job.training_meta, "model_ref": result.model_ref}
                job.status = "ready"
            self.session.flush()
            return job
        except Exception as exc:
            job.status = "failed"
            job.training_meta = {**(job.training_meta or {}), "error": str(exc)}
            self.session.flush()
            raise

    def refresh(self, job: LoraModel) -> LoraModel:
        """Poll an in-progress KREA training job once and update its status."""
        if job.status != "training":
            return job
        job_id = (job.training_meta or {}).get("krea_job_id")
        resolve = getattr(self.trainer, "resolve", None)
        if not (job_id and callable(resolve)):
            return job
        try:
            status, style_id = resolve(job_id)
        except Exception:
            return job
        if status == "ready" and style_id:
            job.weights_uri = style_id
            job.training_meta = {**(job.training_meta or {}), "model_ref": style_id}
            job.status = "ready"
            self.session.flush()
        elif status == "failed":
            job.status = "failed"
            self.session.flush()
        return job


def latest_ready_model(session: Session, persona_id) -> LoraModel | None:
    """The most recent trained-and-ready model for a persona (used by generation)."""
    return (
        session.query(LoraModel)
        .filter(LoraModel.persona_id == persona_id, LoraModel.status == "ready")
        .order_by(LoraModel.created_at.desc())
        .first()
    )
