"""DistributionService — scheduling, approval, and the HARD publish gate (M6).

``publish()`` order of operations (fail-closed at each step, C6):
  1. C2 — ``DisclosureGate.assert_publishable(asset)`` (provenance + visible label).
  2. C5 — resolve an official-API adapter + its synthetic-media policy.
  3. publish via adapter, which MUST set the platform's AI-label flag.
  4. verify the adapter actually set the AI label; else fail closed and do NOT
     mark the post published.

The gate and policy checks run BEFORE any platform call, so an untagged or
unverifiable asset never leaves the building.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.constraints import Constraint, PlatformPolicyError
from app.disclosure.gate import DisclosureGate
from app.distribution.adapters import PlatformAdapter, PublishOutcome, get_adapter
from app.models.asset import Asset
from app.models.post import ApprovalState, Post


class DistributionService:
    def __init__(self, session: Session, *, gate: DisclosureGate | None = None):
        self.session = session
        self.gate = gate or DisclosureGate()

    def schedule(self, *, asset_id, platform: str, caption: str | None = None, scheduled_for=None) -> Post:
        post = Post(
            asset_id=asset_id,
            platform=platform.lower(),
            caption=caption,
            scheduled_for=scheduled_for,
            approval_state=ApprovalState.DRAFT,
        )
        self.session.add(post)
        self.session.flush()
        return post

    def approve(self, post: Post) -> Post:
        post.approval_state = ApprovalState.APPROVED
        self.session.flush()
        return post

    def publish(self, post: Post, *, adapter: PlatformAdapter | None = None) -> PublishOutcome:
        asset: Asset = self.session.get(Asset, post.asset_id)
        if asset is None:
            raise PlatformPolicyError(
                Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE,
                f"post {post.id} references missing asset {post.asset_id}",
            )

        # 1) C1/C2 — server-side disclosure gate. Raises if untagged/invalid.
        try:
            self.gate.assert_publishable(asset)
        except Exception:
            post.approval_state = ApprovalState.FAILED
            self.session.flush()
            raise

        # 2) C5 — official-API adapter + synthetic-media policy.
        adapter = adapter or get_adapter(post.platform)
        _ = adapter.policy  # raises if platform/policy unknown

        # 3) publish via official API (adapter sets the AI label flag).
        outcome = adapter.publish(asset, caption=post.caption)

        # 4) C5 — verify the AI-generated label was actually set.
        if not outcome.ai_label_set:
            post.approval_state = ApprovalState.FAILED
            self.session.flush()
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                f"adapter for '{post.platform}' did not set the AI-generated label — failing closed",
            )

        post.external_post_id = outcome.external_post_id
        post.approval_state = ApprovalState.PUBLISHED
        self.session.flush()
        return outcome
