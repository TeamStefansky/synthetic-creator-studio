"""Platform adapters — official-API distribution only (C5).

Each adapter wraps a platform's *official* publishing API and declares the
synthetic-media policy it satisfies. Adapters receive only already-disclosed
assets (the gate runs before them) and must set the platform's AI-generated
label flag when posting. No scraping, no credential sharing, no rate-limit
evasion is modeled or permitted.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.constraints import Constraint, PlatformPolicyError
from app.distribution.policy import SyntheticMediaPolicy, get_policy
from app.models.asset import Asset


@dataclass
class PublishOutcome:
    platform: str
    external_post_id: str
    ai_label_set: bool
    raw: dict = field(default_factory=dict)


class PlatformAdapter(ABC):
    platform: str = "abstract"

    @property
    def policy(self) -> SyntheticMediaPolicy:
        policy = get_policy(self.platform)
        if policy is None:  # C5 — refuse platforms whose policy we don't model.
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                f"no synthetic-media policy registered for platform '{self.platform}'",
            )
        return policy

    @abstractmethod
    def publish(self, asset: Asset, *, caption: str | None = None) -> PublishOutcome:
        """Publish via the official API with the AI-generated label set."""
        raise NotImplementedError


class StubPlatformAdapter(PlatformAdapter):
    """In-memory adapter that records calls instead of hitting a live API."""

    def __init__(self, platform: str = "instagram"):
        self.platform = platform
        self.calls: list[dict] = []

    def publish(self, asset: Asset, *, caption: str | None = None) -> PublishOutcome:
        policy = self.policy  # validates the platform is modeled (C5)
        # An official-API call would set the AI label field here; we record it.
        call = {
            "asset_id": str(asset.id),
            "caption": caption,
            "ai_label_field": policy.ai_label_field,
            "ai_label_value": True,
        }
        self.calls.append(call)
        return PublishOutcome(
            platform=self.platform,
            external_post_id=f"{self.platform}_{len(self.calls)}",
            ai_label_set=True,
            raw=call,
        )


_REGISTRY: dict[str, type[PlatformAdapter]] = {}


def get_adapter(platform: str) -> PlatformAdapter:
    if platform.lower() in _REGISTRY:
        return _REGISTRY[platform.lower()](platform.lower())  # type: ignore[call-arg]
    if get_policy(platform) is None:
        raise PlatformPolicyError(
            Constraint.PLATFORM_COMPLIANT_ONLY,
            f"platform '{platform}' is not supported via an official-API adapter",
        )
    return StubPlatformAdapter(platform.lower())
