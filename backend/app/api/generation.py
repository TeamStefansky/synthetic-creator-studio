from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider
from app.models.asset import AssetKind
from app.schemas import AssetOut, GenerateRequest

router = APIRouter(prefix="/generate", tags=["generation"])


def get_generation_service(session: Session = Depends(get_session)) -> GenerationService:
    # The concrete provider is swappable; default is the dependency-light stub.
    return GenerationService(session, StubGenerationProvider())


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
