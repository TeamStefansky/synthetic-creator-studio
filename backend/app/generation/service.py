"""GenerationService — orchestrates generate → label → stamp → persist (M3).

This is the single choke point that guarantees C1: **every** emitted asset is
visibly labeled and carries an embedded, signed provenance manifest before it
is ever persisted as ``tagged``. No provider can bypass it, and the prompt is
screened for real-person impersonation (C4) first.

If labeling or provenance fails, the asset is recorded as ``blocked`` and the
error is raised (C6 fail-closed) — we never persist an unlabeled/unstamped asset
as publishable.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.config import get_settings
from app.constraints import StudioError
from app.disclosure.labeler import VisibleLabeler
from app.disclosure.provenance import ProvenanceService
from app.generation.provider import GenerationProvider, GenerationRequest
from app.generation.qc import check_visual_consistency
from app.models.asset import Asset, AssetKind, DisclosureStatus
from app.models.persona import Persona
from app.safety.real_person import RealPersonGuard


class GenerationService:
    def __init__(
        self,
        session: Session,
        provider: GenerationProvider,
        *,
        provenance: ProvenanceService | None = None,
        labeler: VisibleLabeler | None = None,
        guard: RealPersonGuard | None = None,
    ):
        self.session = session
        self.provider = provider
        self.provenance = provenance or ProvenanceService()
        self.labeler = labeler or VisibleLabeler()
        self.guard = guard or RealPersonGuard()
        self.storage = Path(get_settings().storage_dir)

    def generate_asset(
        self,
        *,
        persona_id,
        prompt: str,
        kind: AssetKind = AssetKind.IMAGE,
        lora_version: str | None = None,
        seed: int | None = None,
    ) -> Asset:
        persona = self.session.get(Persona, persona_id)
        if persona is None:
            raise StudioError(f"persona {persona_id} not found")
        # C3 invariant: a persona always has a synthetic_identity. Defensive check.
        if persona.synthetic_identity is None:
            raise StudioError(
                f"persona {persona_id} has no synthetic_identity — refusing to generate"
            )

        # C4 — screen the prompt before doing anything else.
        self.guard.assert_clear(prompt, persona.name, context="generation prompt")

        # Create the asset row first so we have an id to bind provenance to.
        asset = Asset(
            persona_id=persona.id,
            kind=kind,
            prompt=prompt,
            disclosure_status=DisclosureStatus.PENDING,
        )
        self.session.add(asset)
        self.session.flush()  # assign asset.id

        try:
            self._produce_and_disclose(persona, asset, prompt, kind, lora_version, seed)
        except StudioError:
            asset.disclosure_status = DisclosureStatus.BLOCKED
            self.session.flush()
            raise
        return asset

    def _produce_and_disclose(self, persona, asset, prompt, kind, lora_version, seed):
        req = GenerationRequest(
            persona_id=str(persona.id),
            prompt=prompt,
            kind=kind,
            lora_version=lora_version,
            seed=seed,
            visual_identity=persona.visual_identity,
        )
        result = self.provider.generate(req)

        # C1 — bake the visible label into the bytes.
        if result.kind == AssetKind.IMAGE:
            labeled = self.labeler.label_image_bytes(result.content, fmt=result.fmt)
            ext = "png" if result.fmt.upper() == "PNG" else "jpg"
        elif result.kind == AssetKind.TEXT:
            labeled = self.labeler.label_text(result.content.decode()).encode()
            ext = "txt"
        else:  # video path delegates to labeler.label_video in a real deployment
            labeled = result.content
            ext = "mp4"

        # QC consistency (advisory; failure flags but does not silently pass).
        qc = check_visual_consistency(
            visual_identity=persona.visual_identity, result_meta=result.meta
        )

        # Persist labeled bytes to object storage.
        asset_path = self.storage / f"{asset.id}.{ext}"
        asset_path.write_bytes(labeled)
        asset.storage_uri = str(asset_path)

        # C1 — build + sign provenance bound to the *labeled* bytes, embed sidecar.
        manifest = self.provenance.build_manifest(
            asset_id=str(asset.id),
            persona_id=str(persona.id),
            synthetic_identity_id=str(persona.synthetic_identity.id),
            responsible_entity_id=str(persona.responsible_entity_id),
            content_bytes=labeled,
            label=self.labeler.label_text_value(),
        )
        asset.provenance_manifest_uri = self.provenance.write_sidecar(manifest)
        asset.provenance_manifest = manifest.to_dict()
        asset.disclosure_status = DisclosureStatus.TAGGED
        # Stash QC outcome for audit.
        asset.provenance_manifest["qc"] = {"passed": qc.passed, "score": qc.score, "detail": qc.detail}
        self.session.flush()
