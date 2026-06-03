"""Pluggable provenance backends (C1).

Both backends share one interface so generation + the disclosure gate are
agnostic to how Content Credentials are realized:

- ``HmacProvenanceBackend`` — verifiable HMAC-signed JSON manifest bound to the
  asset bytes by content hash; sidecar-stored. Zero infra, fully deterministic.
- ``C2paProvenanceBackend`` — real C2PA Content Credentials embedded directly
  into the image bytes via ``c2pa-python``; verified by reading the embedded
  manifest back. Non-embeddable kinds (text) transparently fall back to HMAC.

``stamp`` returns the (possibly modified) signed bytes to persist plus a manifest
dict for audit. ``verify_asset`` re-checks integrity + the AI assertion and fails
closed (C6).
"""
from __future__ import annotations

import io
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.config import get_settings
from app.disclosure.provenance import ProvenanceService
from app.models.asset import AssetKind

# IPTC DigitalSourceType for fully AI-generated media.
TRAINED_ALGORITHMIC_MEDIA = (
    "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
)
_DISCLOSURE_ASSERTION = "org.scs.disclosure"


@dataclass
class StampResult:
    signed_bytes: bytes
    manifest: dict
    sidecar_uri: str | None
    backend: str


class ProvenanceBackend(ABC):
    name: str = "abstract"

    @abstractmethod
    def stamp(
        self,
        *,
        asset_id: str,
        persona_id: str,
        synthetic_identity_id: str,
        responsible_entity_id: str,
        content_bytes: bytes,
        kind: AssetKind,
        fmt: str,
        label: str,
    ) -> StampResult: ...

    @abstractmethod
    def verify_asset(self, *, manifest: dict | None, signed_bytes: bytes | None, asset_id: str) -> bool: ...


class HmacProvenanceBackend(ProvenanceBackend):
    name = "hmac"

    def __init__(self, service: ProvenanceService | None = None):
        self.service = service or ProvenanceService()

    def stamp(self, *, asset_id, persona_id, synthetic_identity_id, responsible_entity_id,
              content_bytes, kind, fmt, label) -> StampResult:
        manifest = self.service.build_manifest(
            asset_id=asset_id,
            persona_id=persona_id,
            synthetic_identity_id=synthetic_identity_id,
            responsible_entity_id=responsible_entity_id,
            content_bytes=content_bytes,
            label=label,
        )
        sidecar = self.service.write_sidecar(manifest)
        # HMAC does not modify the asset bytes; the signed manifest is the sidecar.
        return StampResult(signed_bytes=content_bytes, manifest=manifest.to_dict(),
                           sidecar_uri=sidecar, backend=self.name)

    def verify_asset(self, *, manifest, signed_bytes, asset_id) -> bool:
        if not manifest:
            return False
        m = self.service.load_manifest(manifest)
        if str(m.asset_id) != str(asset_id):
            return False
        return self.service.verify(m, content_bytes=signed_bytes)


class C2paProvenanceBackend(ProvenanceBackend):
    """Real C2PA Content Credentials embedded into image bytes."""

    name = "c2pa"

    def __init__(self):
        from app.disclosure import c2pa_signing

        if not c2pa_signing.c2pa_available():  # pragma: no cover
            raise RuntimeError("c2pa-python not installed; use the hmac backend")
        self._signing = c2pa_signing
        # HMAC fallback for non-embeddable kinds (e.g. text).
        self._fallback = HmacProvenanceBackend()

    @staticmethod
    def _mime(fmt: str) -> str:
        return {"PNG": "image/png", "JPEG": "image/jpeg", "JPG": "image/jpeg"}.get(
            fmt.upper(), "image/png"
        )

    def stamp(self, *, asset_id, persona_id, synthetic_identity_id, responsible_entity_id,
              content_bytes, kind, fmt, label) -> StampResult:
        if kind != AssetKind.IMAGE:
            # Text/video: c2pa embedding not applicable here → HMAC sidecar.
            return self._fallback.stamp(
                asset_id=asset_id, persona_id=persona_id,
                synthetic_identity_id=synthetic_identity_id,
                responsible_entity_id=responsible_entity_id,
                content_bytes=content_bytes, kind=kind, fmt=fmt, label=label,
            )

        import c2pa

        manifest_def = {
            "claim_generator": "synthetic-creator-studio",
            "title": f"asset-{asset_id}",
            "assertions": [
                {"label": "c2pa.actions", "data": {"actions": [
                    {"action": "c2pa.created", "digitalSourceType": TRAINED_ALGORITHMIC_MEDIA}
                ]}},
                {"label": _DISCLOSURE_ASSERTION, "data": {
                    "ai_generated": True,
                    "label": label,
                    "asset_id": str(asset_id),
                    "persona_id": str(persona_id),
                    "synthetic_identity_id": str(synthetic_identity_id),
                    "responsible_entity_id": str(responsible_entity_id),
                }},
            ],
        }
        signer = self._signing.build_signer()
        builder = c2pa.Builder.from_json(json.dumps(manifest_def))
        dest = io.BytesIO()
        builder.sign(signer, self._mime(fmt), io.BytesIO(content_bytes), dest)
        signed = dest.getvalue()

        # Persist a JSON sidecar copy of the embedded manifest for audit.
        manifest_dict = {
            "backend": "c2pa",
            "asset_id": str(asset_id),
            "ai_generated": True,
            "label": label,
            "definition": manifest_def,
        }
        try:
            reader = c2pa.Reader(self._mime(fmt), io.BytesIO(signed))
            manifest_dict["embedded"] = json.loads(reader.json())
        except Exception:  # pragma: no cover - read-back best effort
            pass

        sidecar = ProvenanceService().storage_path(f"{asset_id}.c2pa.json")
        sidecar.write_text(json.dumps(manifest_dict, indent=2))
        return StampResult(signed_bytes=signed, manifest=manifest_dict,
                           sidecar_uri=str(sidecar), backend=self.name)

    def verify_asset(self, *, manifest, signed_bytes, asset_id) -> bool:
        if not manifest:
            return False
        if manifest.get("backend") == "hmac":
            return self._fallback.verify_asset(
                manifest=manifest, signed_bytes=signed_bytes, asset_id=asset_id
            )
        if signed_bytes is None:
            return False

        import c2pa

        try:
            reader = c2pa.Reader("image/png", io.BytesIO(signed_bytes))
        except Exception:
            # Unreadable/destroyed credentials → fail closed.
            return False

        try:
            results = reader.get_validation_results() or {}
            data = json.loads(reader.json())
        except Exception:
            return False

        active = data.get("manifests", {}).get(data.get("active_manifest"), {})
        # 1) AI-generation assertion must be present.
        labels = {a.get("label", "") for a in active.get("assertions", [])}
        ai_asserted = _DISCLOSURE_ASSERTION in labels or any(
            "actions" in lbl for lbl in labels
        )
        if not ai_asserted:
            return False

        # 2) Our disclosure assertion must bind to THIS asset.
        if not _assertion_binds_asset(active, asset_id):
            return False

        am = results.get("activeManifest", {})
        success = {s.get("code") for s in am.get("success", [])}
        failure = {f.get("code") for f in am.get("failure", [])}

        # 3) Integrity: data-hash must match and no integrity failures present.
        integrity_failures = {
            "assertion.dataHash.mismatch",
            "assertion.hashedURI.mismatch",
            "assertion.dataHash.missing",
        }
        if failure & integrity_failures:
            return False
        if "assertion.dataHash.match" not in success:
            return False

        settings = get_settings()
        if settings.c2pa_require_valid_state:
            # Strict mode for correct production builds.
            return str(reader.get_validation_state()) == "Valid"

        # Dev mode: integrity + AI assertion + trust anchor (claimSignature quirk
        # in the prebuilt wheel is tolerated; see c2pa_signing module docstring).
        if failure - {"claimSignature.mismatch", "claimSignature.missing"}:
            return False
        return "signingCredential.trusted" in success


def _assertion_binds_asset(active_manifest: dict, asset_id: str) -> bool:
    for a in active_manifest.get("assertions", []):
        if a.get("label") == _DISCLOSURE_ASSERTION:
            return str(a.get("data", {}).get("asset_id")) == str(asset_id)
    return False


def get_provenance_backend(name: str | None = None) -> ProvenanceBackend:
    backend = (name or get_settings().provenance_backend).lower()
    if backend == "c2pa":
        return C2paProvenanceBackend()
    return HmacProvenanceBackend()
