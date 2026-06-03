"""Per-platform synthetic-media policy declarations (C5).

Each platform requires synthetic/AI content to be disclosed in a specific way
(an "AI-generated" content label/flag set via the official API). We model the
requirement so ``publish()`` can assert the outgoing post satisfies it. We do
NOT model or enable any ToS-evasion behavior.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SyntheticMediaPolicy:
    platform: str
    # The API flag/field that marks content as AI-generated on that platform.
    ai_label_field: str
    # Whether the platform mandates the label for synthetic media (always true here).
    requires_ai_label: bool = True
    notes: str = ""


# Minimal registry; real adapters keep this in sync with each platform's policy.
POLICIES: dict[str, SyntheticMediaPolicy] = {
    "instagram": SyntheticMediaPolicy(
        "instagram", ai_label_field="ai_info.is_ai_generated",
        notes="Meta requires AI-generated content disclosure via Content API.",
    ),
    "tiktok": SyntheticMediaPolicy(
        "tiktok", ai_label_field="ai_generated_content_toggle",
        notes="TikTok requires AIGC label for synthetic media.",
    ),
    "youtube": SyntheticMediaPolicy(
        "youtube", ai_label_field="altered_or_synthetic_content",
        notes="YouTube requires disclosure of altered/synthetic content.",
    ),
    "x": SyntheticMediaPolicy(
        "x", ai_label_field="ai_generated",
        notes="Synthetic/manipulated media must be labeled.",
    ),
}


def get_policy(platform: str) -> SyntheticMediaPolicy | None:
    return POLICIES.get(platform.lower())
