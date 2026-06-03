"""Strategy module (Milestone 5).

Produces a strategy document — audience, content pillars, tone, recommended
platforms, themes — for a *named brand's* persona. Trend/topic/hashtag mapping
feeds in as strategy input.

C4 boundary: this analyzes audience *fit* for an accountable brand. It must not
be used to impersonate a population or any real individual; persona-defining
inputs remain subject to the real-person guard upstream.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.persona import Persona
from app.models.strategy import Strategy

# Tiny illustrative knowledge base; a real impl calls cultural/trend analytics.
_PLATFORM_BY_INTEREST = {
    "fashion": ["instagram", "tiktok"],
    "gaming": ["youtube", "tiktok", "x"],
    "tech": ["x", "youtube"],
    "lifestyle": ["instagram", "tiktok"],
}


class StrategyService:
    def __init__(self, session: Session):
        self.session = session

    def build_strategy(
        self,
        *,
        persona_id,
        title: str,
        region: str,
        language: str,
        interests: list[str],
        trends: list[str] | None = None,
    ) -> Strategy:
        persona = self.session.get(Persona, persona_id)
        if persona is None:
            raise ValueError(f"persona {persona_id} not found")

        platforms: list[str] = []
        for interest in interests:
            platforms.extend(_PLATFORM_BY_INTEREST.get(interest.lower(), []))
        platforms = sorted(set(platforms)) or ["instagram"]

        pillars = [f"{i.title()} content" for i in interests] or ["Brand storytelling"]
        themes = (trends or []) + [f"{region} {interests[0] if interests else 'culture'} fit"]

        strategy = Strategy(
            persona_id=persona.id,
            title=title,
            audience={"region": region, "language": language, "interests": interests},
            content_pillars=pillars,
            tone=persona.voice_tone or "authentic, transparent, clearly AI",
            recommended_platforms=platforms,
            themes=themes,
        )
        self.session.add(strategy)
        self.session.flush()
        return strategy
