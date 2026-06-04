"""Celery tasks for generation + publishing.

These are thin wrappers that open a DB session and delegate to the services,
so the disclosure guarantees (C1/C2) are identical whether work runs inline or
on a worker. Decorators are applied only if Celery is available.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.distribution.service import DistributionService
from app.generation.lora import run_training
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider
from app.models.asset import AssetKind
from app.models.post import Post
from workers.celery_app import celery_app


def _generate(persona_id: str, prompt: str, kind: str = "image") -> str:
    session = SessionLocal()
    try:
        service = GenerationService(session, StubGenerationProvider())
        asset = service.generate_asset(persona_id=persona_id, prompt=prompt, kind=AssetKind(kind))
        session.commit()
        return str(asset.id)
    finally:
        session.close()


def _publish(post_id: str) -> str:
    session = SessionLocal()
    try:
        post = session.get(Post, post_id)
        DistributionService(session).publish(post)  # hard gate inside
        session.commit()
        return str(post.external_post_id)
    finally:
        session.close()


def _train_lora(lora_model_id: str) -> str:
    session = SessionLocal()
    try:
        model = run_training(session, lora_model_id)
        session.commit()
        return model.status
    finally:
        session.close()


if celery_app is not None:  # pragma: no cover - requires celery
    generate_asset_task = celery_app.task(name="generation.generate_asset")(_generate)
    publish_post_task = celery_app.task(name="distribution.publish_post")(_publish)
    train_lora_task = celery_app.task(name="generation.train_lora")(_train_lora)
else:  # pragma: no cover
    generate_asset_task = _generate
    publish_post_task = _publish
    train_lora_task = _train_lora
