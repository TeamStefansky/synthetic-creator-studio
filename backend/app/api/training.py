"""Training API — upload reference images and train a persona's likeness.

POST /personas/{id}/training-images  — upload reference images (multipart)
GET  /personas/{id}/training-images  — list the dataset
POST /personas/{id}/train            — start training (requires C4 attestation)
"""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.generation.training_service import PersonaTrainingService, TrainingAttestation
from app.models.persona import Persona
from app.models.training_image import TrainingImage
from app.schemas import LoraModelOut, TrainingImageOut, TrainRequest

router = APIRouter(tags=["training"])

# Magic-byte signatures for accepted image types (defense in depth vs content-type).
_SIGNATURES = {
    b"\x89PNG\r\n\x1a\n": ("image/png", "png"),
    b"\xff\xd8\xff": ("image/jpeg", "jpg"),
    b"RIFF": ("image/webp", "webp"),
}


def _detect_image(data: bytes) -> tuple[str, str] | None:
    for sig, info in _SIGNATURES.items():
        if data.startswith(sig):
            return info
    return None


@router.post("/personas/{persona_id}/training-images", response_model=list[TrainingImageOut], status_code=201)
async def upload_training_images(
    persona_id: uuid.UUID, files: list[UploadFile], session: Session = Depends(get_session)
):
    persona = session.get(Persona, persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="persona not found")

    dataset_dir = Path(get_settings().storage_dir) / "datasets" / str(persona_id)
    dataset_dir.mkdir(parents=True, exist_ok=True)

    created: list[TrainingImage] = []
    for f in files:
        data = await f.read()
        detected = _detect_image(data)
        if detected is None:
            raise HTTPException(status_code=415, detail=f"'{f.filename}' is not a supported image (PNG/JPEG/WebP)")
        content_type, ext = detected
        digest = hashlib.sha256(data).hexdigest()
        path = dataset_dir / f"{digest[:16]}.{ext}"
        path.write_bytes(data)
        img = TrainingImage(
            persona_id=persona_id, storage_uri=str(path),
            content_hash=digest, content_type=content_type,
        )
        session.add(img)
        created.append(img)
    session.flush()
    return created


@router.get("/personas/{persona_id}/training-images", response_model=list[TrainingImageOut])
def list_training_images(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    return (
        session.query(TrainingImage)
        .filter(TrainingImage.persona_id == persona_id)
        .order_by(TrainingImage.created_at.desc())
        .all()
    )


@router.post("/personas/{persona_id}/train", response_model=LoraModelOut, status_code=202)
def train_persona(persona_id: uuid.UUID, payload: TrainRequest, session: Session = Depends(get_session)):
    # C4 attestation is enforced inside the service (ConstraintViolation -> 422).
    attestation = TrainingAttestation(
        no_real_person=payload.no_real_person,
        rights_confirmed=payload.rights_confirmed,
        subject_note=payload.subject_note,
    )
    job = PersonaTrainingService(session).start_training(
        persona_id=persona_id,
        attestation=attestation,
        base_model=payload.base_model,
        name=payload.name,
        optimize_for=payload.optimize_for,
        run_inline=payload.run_inline,
    )
    return job
