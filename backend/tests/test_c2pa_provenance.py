"""Real C2PA Content Credentials: embed → read back → gate → tamper (C1/C2).

Uses the c2pa-python backend with dev signing credentials. Skipped only if the
c2pa native library is unavailable.
"""
from __future__ import annotations

import io
from pathlib import Path

import pytest

from app.disclosure import c2pa_signing
from app.disclosure.backends import C2paProvenanceBackend
from app.disclosure.gate import DisclosureGate
from app.distribution.adapters import StubPlatformAdapter
from app.distribution.service import DistributionService
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider

pytestmark = pytest.mark.skipif(
    not c2pa_signing.c2pa_available(), reason="c2pa-python not installed"
)


def _c2pa_services(session):
    backend = C2paProvenanceBackend()
    gen = GenerationService(session, StubGenerationProvider(), backend=backend)
    gate = DisclosureGate(backend=backend)
    return gen, gate


def test_c2pa_embeds_real_content_credentials(session, persona):
    import c2pa

    gen, gate = _c2pa_services(session)
    asset = gen.generate_asset(persona_id=persona.id, prompt="studio portrait, soft light")

    assert asset.disclosure_status.value == "tagged"
    signed = Path(asset.storage_uri).read_bytes()

    # The bytes carry a readable, embedded C2PA manifest with our disclosure assertion.
    reader = c2pa.Reader("image/png", io.BytesIO(signed))
    import json

    data = json.loads(reader.json())
    active = data["manifests"][data["active_manifest"]]
    labels = [a["label"] for a in active["assertions"]]
    assert any(lbl == "org.scs.disclosure" for lbl in labels)

    # The gate accepts the genuinely-disclosed asset.
    gate.assert_publishable(asset)
    assert gate.is_publishable(asset) is True


def test_c2pa_tamper_fails_closed(session, persona):
    gen, gate = _c2pa_services(session)
    asset = gen.generate_asset(persona_id=persona.id, prompt="studio portrait")

    # Corrupt the credentialed bytes → integrity check / read must fail closed.
    raw = bytearray(Path(asset.storage_uri).read_bytes())
    for i in range(200, 240):
        raw[i] ^= 0xFF
    Path(asset.storage_uri).write_bytes(bytes(raw))

    assert gate.is_publishable(asset) is False


def test_c2pa_publish_through_gate(session, persona):
    backend = C2paProvenanceBackend()
    gen = GenerationService(session, StubGenerationProvider(), backend=backend)
    asset = gen.generate_asset(persona_id=persona.id, prompt="cheerful portrait")

    dist = DistributionService(session, gate=DisclosureGate(backend=backend))
    post = dist.schedule(asset_id=asset.id, platform="instagram", caption="hi, I'm AI")
    outcome = dist.publish(post, adapter=StubPlatformAdapter("instagram"))
    assert outcome.ai_label_set is True
    assert post.approval_state.value == "published"
