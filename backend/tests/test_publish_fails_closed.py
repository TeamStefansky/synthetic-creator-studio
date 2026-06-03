"""Publish with a missing/invalid manifest fails closed (Build Brief §6)."""
from __future__ import annotations

import copy
from pathlib import Path

import pytest

from app.constraints import ConstraintViolation, DisclosureError, PlatformPolicyError
from app.distribution.adapters import StubPlatformAdapter
from app.distribution.service import DistributionService
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider
from app.models.asset import Asset, AssetKind, DisclosureStatus
from app.models.post import ApprovalState


def _tagged_asset(session, persona):
    service = GenerationService(session, StubGenerationProvider())
    return service.generate_asset(persona_id=persona.id, prompt="brand portrait")


def test_publish_missing_manifest_fails_closed(session, persona):
    asset = Asset(persona_id=persona.id, kind=AssetKind.IMAGE, disclosure_status=DisclosureStatus.PENDING)
    session.add(asset)
    session.flush()
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="instagram")
    with pytest.raises(DisclosureError):
        dist.publish(post)
    session.refresh(post)
    assert post.approval_state == ApprovalState.FAILED
    assert post.external_post_id is None


def test_publish_tampered_manifest_fails_closed(session, persona):
    asset = _tagged_asset(session, persona)
    # Forge the manifest signature → must be rejected on verify.
    tampered = copy.deepcopy(asset.provenance_manifest)
    tampered["signature"] = "deadbeef" * 8
    asset.provenance_manifest = tampered
    session.flush()

    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="instagram")
    with pytest.raises(DisclosureError):
        dist.publish(post)
    session.refresh(post)
    assert post.approval_state == ApprovalState.FAILED


def test_publish_tampered_bytes_fails_closed(session, persona):
    asset = _tagged_asset(session, persona)
    # Mutate the asset bytes after stamping → content hash no longer matches.
    Path(asset.storage_uri).write_bytes(b"not the original bytes")
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="instagram")
    with pytest.raises(DisclosureError):
        dist.publish(post)


def test_publish_unsupported_platform_fails_closed(session, persona):
    asset = _tagged_asset(session, persona)
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="some-scraper-network")
    with pytest.raises(PlatformPolicyError):
        dist.publish(post)


def test_publish_adapter_without_ai_label_fails_closed(session, persona):
    asset = _tagged_asset(session, persona)
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="instagram")

    class BadAdapter(StubPlatformAdapter):
        def publish(self, asset, *, caption=None):
            out = super().publish(asset, caption=caption)
            out.ai_label_set = False  # simulate platform label not applied
            return out

    with pytest.raises(ConstraintViolation):
        dist.publish(post, adapter=BadAdapter("instagram"))
    session.refresh(post)
    assert post.approval_state == ApprovalState.FAILED
