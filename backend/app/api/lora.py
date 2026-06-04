from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.generation.lora import LoraRegistry, run_training
from app.models.lora_model import LoraModel
from app.schemas import LoraModelOut, LoraTrainRequest

router = APIRouter(prefix="/lora", tags=["lora"])


@router.post("/train", response_model=LoraModelOut, status_code=202)
def train(payload: LoraTrainRequest, session: Session = Depends(get_session)):
    job = LoraRegistry(session).create_training_job(
        persona_id=payload.persona_id,
        base_model=payload.base_model,
        dataset_uri=payload.dataset_uri,
    )
    if payload.run_inline:
        # Run now (dev / no broker). In prod, enqueue workers.tasks.train_lora_task.
        run_training(session, job.id)
        session.refresh(job)
    else:
        from workers.tasks import train_lora_task

        train_lora_task(str(job.id))
        session.refresh(job)
    return job


@router.get("/{lora_id}", response_model=LoraModelOut)
def get(lora_id: uuid.UUID, session: Session = Depends(get_session)):
    model = session.get(LoraModel, lora_id)
    if model is None:
        raise HTTPException(status_code=404, detail="lora model not found")
    return model
