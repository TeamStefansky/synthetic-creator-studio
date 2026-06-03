"""Integration — generate → assert provenance embedded → publish gate passes
only when tagged (Build Brief §6)."""
from __future__ import annotations

from pathlib import Path

from app.disclosure.gate import DisclosureGate
from app.disclosure.provenance import ProvenanceService
from app.distribution.adapters import StubPlatformAdapter
from app.distribution.service import DistributionService
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider
from app.models.asset import DisclosureStatus


def test_generate_embeds_provenance_and_publishes(session, persona):
    service = GenerationService(session, StubGenerationProvider())
    asset = service.generate_asset(persona_id=persona.id, prompt="brand portrait in studio light")

    # Provenance embedded + visible label baked → tagged.
    assert asset.disclosure_status == DisclosureStatus.TAGGED
    assert asset.provenance_manifest is not None
    assert asset.provenance_manifest_uri and Path(asset.provenance_manifest_uri).exists()
    assert asset.storage_uri and Path(asset.storage_uri).exists()

    # Manifest is valid, signed, AI-asserted, and bound to the labeled bytes.
    prov = ProvenanceService()
    manifest = prov.load_manifest(asset.provenance_manifest)
    content = Path(asset.storage_uri).read_bytes()
    assert prov.verify(manifest, content_bytes=content) is True
    assert manifest.ai_generated is True
    assert manifest.synthetic_identity_id == str(persona.synthetic_identity.id)

    # Gate passes for the tagged asset; publish via official-API adapter succeeds.
    DisclosureGate().assert_publishable(asset)
    dist = DistributionService(session)
    post = dist.schedule(asset_id=asset.id, platform="instagram", caption="hello, I am an AI")
    adapter = StubPlatformAdapter("instagram")
    outcome = dist.publish(post, adapter=adapter)

    assert outcome.ai_label_set is True
    assert outcome.external_post_id
    assert adapter.calls and adapter.calls[0]["ai_label_value"] is True


def test_visible_label_is_present_in_image_bytes(session, persona):
    """The emitted image differs from a raw render — a label was composited in."""
    from app.generation.provider import GenerationRequest

    provider = StubGenerationProvider()
    raw = provider.generate(
        GenerationRequest(persona_id=str(persona.id), prompt="studio shot",
                          visual_identity=persona.visual_identity)
    ).content

    service = GenerationService(session, provider)
    asset = service.generate_asset(persona_id=persona.id, prompt="studio shot")
    labeled = Path(asset.storage_uri).read_bytes()
    assert labeled != raw  # labeling changed the pixels (C1)
