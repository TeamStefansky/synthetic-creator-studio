from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.generation.factory import get_provider
from app.generation.service import GenerationService
from app.models.asset import AssetKind
from app.schemas import AssetOut, GenerateRequest

router = APIRouter(prefix="/generate", tags=["generation"])


def get_generation_service(session: Session = Depends(get_session)) -> GenerationService:
    # Provider + provenance backend are selected from settings (stub/HMAC by
    # default; diffusion/C2PA in production). Disclosure is enforced regardless.
    return GenerationService(session, get_provider())


@router.post("", response_model=AssetOut, status_code=201)
def generate(
    payload: GenerateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    asset = service.generate_asset(
        persona_id=payload.persona_id,
        prompt=payload.prompt,
        kind=AssetKind(payload.kind),
        lora_version=payload.lora_version,
        seed=payload.seed,
    )
    return asset
