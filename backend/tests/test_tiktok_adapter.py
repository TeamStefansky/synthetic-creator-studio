"""TikTokAdapter — official Content Posting API + AIGC label + fail-closed (C5)."""
from __future__ import annotations

import pytest

from app.constraints import PlatformPolicyError
from app.distribution.policy import get_policy
from app.distribution.service import DistributionService
from app.distribution.tiktok_adapter import TikTokAdapter
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider


class _Resp:
    def __init__(self, payload):
        self._p = payload
        self.status_code = 200

    def json(self):
        return self._p


class _Client:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def post(self, url, json=None, headers=None, **kw):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return _Resp(self._responses.pop(0))


def _asset(session, persona):
    return GenerationService(session, StubGenerationProvider()).generate_asset(
        persona_id=persona.id, prompt="studio portrait"
    )


def _adapter(client, *, token="tok"):
    return TikTokAdapter(
        access_token=token,
        asset_url_resolver=lambda a: "https://cdn.example/asset.png",
        client=client,
    )


def test_tiktok_sets_aigc_label_and_returns_publish_id(session, persona):
    asset = _asset(session, persona)
    client = _Client([{"data": {"publish_id": "pub_123"}, "error": {"code": "ok"}}])
    outcome = _adapter(client).publish(asset, caption="hi, I am AI")

    assert outcome.external_post_id == "pub_123"
    assert outcome.ai_label_set is True
    field = get_policy("tiktok").ai_label_field
    assert client.calls[0]["json"]["post_info"][field] is True
    assert client.calls[0]["headers"]["Authorization"] == "Bearer tok"


def test_tiktok_missing_token_fails_closed(session, persona):
    asset = _asset(session, persona)
    with pytest.raises(PlatformPolicyError):
        _adapter(_Client([]), token="").publish(asset)


def test_tiktok_api_error_fails_closed(session, persona):
    asset = _asset(session, persona)
    client = _Client([{"error": {"code": "spam_risk_too_many_posts"}}])
    with pytest.raises(PlatformPolicyError):
        _adapter(client).publish(asset)


def test_tiktok_publishes_through_disclosure_gate(session, persona):
    asset = _asset(session, persona)
    client = _Client([{"data": {"publish_id": "p1"}, "error": {"code": "ok"}}])
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="tiktok")
    outcome = dist.publish(post, adapter=_adapter(client))
    assert outcome.external_post_id == "p1"
    assert post.approval_state.value == "published"
