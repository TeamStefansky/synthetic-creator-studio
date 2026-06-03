"""MetaInstagramAdapter — official-API request building + AI-label + fail-closed.

Uses a fake httpx-style client so we assert the exact requests without network.
"""
from __future__ import annotations

import json

import pytest

from app.constraints import PlatformPolicyError
from app.distribution.meta_adapter import MetaInstagramAdapter
from app.distribution.service import DistributionService
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def json(self):
        return self._payload


class _FakeClient:
    """Records POSTs and returns canned container/publish responses in order."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def post(self, url, data=None, **kw):
        self.calls.append({"url": url, "data": data})
        return _FakeResponse(self._responses.pop(0))


def _adapter(client, *, token="tok", ig="123"):
    return MetaInstagramAdapter(
        ig_user_id=ig,
        access_token=token,
        asset_url_resolver=lambda a: "https://cdn.example/asset.png",
        client=client,
    )


def test_meta_adapter_two_step_flow_sets_ai_label(session, persona):
    asset = GenerationService(session, StubGenerationProvider()).generate_asset(
        persona_id=persona.id, prompt="studio portrait"
    )
    client = _FakeClient([{"id": "container_1"}, {"id": "media_99"}])
    adapter = _adapter(client)

    outcome = adapter.publish(asset, caption="hello, I am AI")

    assert outcome.external_post_id == "media_99"
    assert outcome.ai_label_set is True
    # Container creation must carry Meta's AI-generated disclosure flag.
    create_call = client.calls[0]
    assert create_call["url"].endswith("/123/media")
    assert json.loads(create_call["data"]["ai_info"]) == {"is_ai_generated": True}
    # Second call publishes the returned container id.
    assert client.calls[1]["data"]["creation_id"] == "container_1"


def test_meta_adapter_missing_credentials_fails_closed(session, persona):
    asset = GenerationService(session, StubGenerationProvider()).generate_asset(
        persona_id=persona.id, prompt="portrait"
    )
    adapter = _adapter(_FakeClient([]), token="")
    with pytest.raises(PlatformPolicyError):
        adapter.publish(asset)


def test_meta_adapter_non_https_url_fails_closed(session, persona):
    asset = GenerationService(session, StubGenerationProvider()).generate_asset(
        persona_id=persona.id, prompt="portrait"
    )
    adapter = MetaInstagramAdapter(
        ig_user_id="123", access_token="tok",
        asset_url_resolver=lambda a: "http://insecure.example/x.png",
        client=_FakeClient([]),
    )
    with pytest.raises(PlatformPolicyError):
        adapter.publish(asset)


def test_meta_adapter_publish_runs_through_disclosure_gate(session, persona):
    """The hard gate still applies: a real adapter never sees an untagged asset."""
    asset = GenerationService(session, StubGenerationProvider()).generate_asset(
        persona_id=persona.id, prompt="portrait"
    )
    client = _FakeClient([{"id": "c1"}, {"id": "m1"}])
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="instagram")
    outcome = dist.publish(post, adapter=_adapter(client))
    assert outcome.external_post_id == "m1"
    assert post.approval_state.value == "published"
