"""In-process demo seeding (used for hosted demos).

When ``SCS_SEED_DEMO=1`` the app seeds a small, realistic dataset on startup if
the database is empty, so a freshly deployed link is immediately populated. It
goes through the real services, so every asset is disclosed and every publish
passes the hard gate — no constraint is bypassed for the demo.
"""
from __future__ import annotations

import random

from sqlalchemy.orm import Session

from app.analytics.service import AnalyticsService
from app.distribution.service import DistributionService
from app.generation.factory import get_provider
from app.generation.service import GenerationService
from app.models.persona import Persona
from app.models.post import ApprovalState
from app.services.entities import create_responsible_entity
from app.services.personas import create_persona

_PALETTES = {"Nova": [40, 120, 200], "Kai": [200, 90, 60], "Lumi": [120, 80, 200]}
_PROMPTS = [
    "studio portrait, soft window light, warm tones",
    "golden hour rooftop, candid smile",
    "minimalist set, brand colors",
    "editorial neon city night",
]


def seed_if_empty(session: Session) -> bool:
    """Seed demo data when no personas exist. Returns True if it seeded."""
    if session.query(Persona).first() is not None:
        return False

    entity = create_responsible_entity(
        session, name="Aurora Labs", contact_email="brand@aurora.example"
    )
    gen = GenerationService(session, get_provider())
    dist = DistributionService(session)
    analytics = AnalyticsService(session)

    for name, color in _PALETTES.items():
        persona = create_persona(
            session,
            responsible_entity_id=entity.id,
            name=name,
            backstory=f"{name} is a disclosed virtual brand ambassador.",
            voice_tone="warm, upbeat, clearly AI",
            visual_identity={"base_color": color, "tags": ["studio", "portrait"]},
        )
        assets = [gen.generate_asset(persona_id=persona.id, prompt=p) for p in _PROMPTS]

        for asset in assets[:2]:
            post = dist.schedule(
                asset_id=asset.id, platform=random.choice(["instagram", "tiktok"])
            )
            dist.approve(post)
            try:
                dist.publish(post)
            except Exception:
                post.approval_state = ApprovalState.FAILED

        for platform in ("instagram", "tiktok"):
            for metric, base in [("reach", 22000), ("engagement", 0.05), ("growth", 0.03), ("sentiment", 0.45)]:
                analytics.record(
                    persona_id=persona.id, platform=platform, metric=metric,
                    value=round(base * (0.8 + 0.4 * random.random()), 4),
                )

    session.commit()
    return True
