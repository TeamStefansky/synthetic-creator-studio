"""Persona training: dataset, C4 attestation enforcement, and trained-model use."""
from __future__ import annotations

import io
import tempfile
import uuid
from pathlib import Path

import pytest

from app.constraints import ConstraintViolation, ImpersonationError, StudioError
from app.generation.provider import GenerationResult
from app.generation.service import GenerationService
from app.generation.training_service import (
    PersonaTrainingService,
    TrainingAttestation,
    latest_ready_model,
)
from app.models.asset import AssetKind, DisclosureStatus
from app.models.training_image import TrainingImage


def _png() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (10, 20, 30)).save(buf, "PNG")
    return buf.getvalue()


def _add_images(session, persona, n=3):
    d = Path(tempfile.mkdtemp(prefix="scs_ds_"))
    for i in range(n):
        p = d / f"img_{i}.png"
        p.write_bytes(_png())
        session.add(TrainingImage(persona_id=persona.id, storage_uri=str(p),
                                  content_hash=uuid.uuid4().hex, content_type="image/png"))
    session.flush()


def _ok_attestation():
    return TrainingAttestation(no_real_person=True, rights_confirmed=True, subject_note="synthetic mascot")


def test_training_requires_no_real_person_attestation(session, persona):
    _add_images(session, persona)
    svc = PersonaTrainingService(session)
    with pytest.raises(ImpersonationError):
        svc.start_training(persona_id=persona.id,
                           attestation=TrainingAttestation(no_real_person=False, rights_confirmed=True))


def test_training_requires_rights_confirmation(session, persona):
    _add_images(session, persona)
    svc = PersonaTrainingService(session)
    with pytest.raises(ConstraintViolation):
        svc.start_training(persona_id=persona.id,
                           attestation=TrainingAttestation(no_real_person=True, rights_confirmed=False))


def test_training_rejects_real_person_subject_note(session, persona):
    _add_images(session, persona)
    svc = PersonaTrainingService(session)
    with pytest.raises(ImpersonationError):
        svc.start_training(
            persona_id=persona.id,
            attestation=TrainingAttestation(no_real_person=True, rights_confirmed=True,
                                            subject_note="deepfake likeness of a real celebrity"),
        )


def test_training_needs_minimum_images(session, persona):
    _add_images(session, persona, n=2)
    with pytest.raises(StudioError):
        PersonaTrainingService(session).start_training(persona_id=persona.id, attestation=_ok_attestation())


def test_training_happy_path_produces_ready_model(session, persona):
    _add_images(session, persona, n=4)
    job = PersonaTrainingService(session).start_training(persona_id=persona.id, attestation=_ok_attestation())
    assert job.status == "ready"
    assert job.weights_uri and job.weights_uri.startswith("stub-lora:")
    assert job.training_meta["attestation"]["no_real_person"] is True
    assert latest_ready_model(session, persona.id).id == job.id


class _SpyProvider:
    name = "spy"

    def __init__(self):
        self.last = None

    def generate(self, request):
        self.last = request
        return GenerationResult(kind=AssetKind.IMAGE, content=_png(), fmt="PNG", meta={})


def test_generation_conditions_on_trained_model(session, persona):
    _add_images(session, persona, n=3)
    job = PersonaTrainingService(session).start_training(persona_id=persona.id, attestation=_ok_attestation())

    spy = _SpyProvider()
    asset = GenerationService(session, spy).generate_asset(persona_id=persona.id, prompt="studio portrait")

    # The trained model ref is passed to the provider, and output is still disclosed.
    assert spy.last.model_ref == job.weights_uri
    assert asset.disclosure_status == DisclosureStatus.TAGGED
