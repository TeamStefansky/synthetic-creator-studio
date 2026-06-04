"""Pydantic request/response schemas for the API."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ---- responsible entity ----
class EntityCreate(BaseModel):
    name: str
    contact_email: str
    kind: str = "brand"
    jurisdiction: str | None = None


class EntityOut(BaseModel):
    id: uuid.UUID
    name: str
    contact_email: str
    kind: str
    jurisdiction: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---- persona ----
class PersonaCreate(BaseModel):
    responsible_entity_id: uuid.UUID
    name: str
    backstory: str | None = None
    voice_tone: str | None = None
    values: list | None = None
    hard_boundaries: list | None = None
    visual_identity: dict | None = None


class SyntheticIdentityOut(BaseModel):
    id: uuid.UUID
    ai_generated: bool
    responsible_entity_id: uuid.UUID

    model_config = {"from_attributes": True}


class PersonaOut(BaseModel):
    id: uuid.UUID
    name: str
    responsible_entity_id: uuid.UUID
    synthetic_identity: SyntheticIdentityOut
    created_at: datetime

    model_config = {"from_attributes": True}


# ---- generation ----
class GenerateRequest(BaseModel):
    persona_id: uuid.UUID
    prompt: str
    kind: str = "image"
    lora_version: str | None = None
    seed: int | None = None


class AssetOut(BaseModel):
    id: uuid.UUID
    persona_id: uuid.UUID
    kind: str
    disclosure_status: str
    storage_uri: str | None = None
    provenance_manifest_uri: str | None = None

    model_config = {"from_attributes": True}


# ---- distribution ----
class ScheduleRequest(BaseModel):
    asset_id: uuid.UUID
    platform: str
    caption: str | None = None


class PostOut(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    platform: str
    approval_state: str
    external_post_id: str | None = None

    model_config = {"from_attributes": True}


class StrategyRequest(BaseModel):
    persona_id: uuid.UUID
    title: str
    region: str
    language: str
    interests: list[str] = Field(default_factory=list)
    trends: list[str] | None = None


# ---- LoRA training ----
class LoraTrainRequest(BaseModel):
    persona_id: uuid.UUID
    base_model: str = "stabilityai/stable-diffusion-2-1"
    dataset_uri: str
    run_inline: bool = True  # run now (no broker) vs enqueue to Celery


class LoraModelOut(BaseModel):
    id: uuid.UUID
    persona_id: uuid.UUID
    version: str
    base_model: str
    status: str
    weights_uri: str | None = None

    model_config = {"from_attributes": True}


# ---- analytics ----
class AnalyticsIngest(BaseModel):
    persona_id: uuid.UUID
    platform: str
    metric: str  # reach|engagement|growth|sentiment
    value: float
    post_id: uuid.UUID | None = None
    extra: dict | None = None
