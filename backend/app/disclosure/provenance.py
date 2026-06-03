"""ProvenanceService — embed and verify Content Credentials (C1).

Production note (honesty): real deployments embed a cryptographically signed
**C2PA** manifest using the ``c2pa-python`` library (Adobe Content
Credentials). That native toolchain is not installable in this sandbox, so this
service implements the *same interface and guarantees* (tamper-evident,
verifiable, asset-bound provenance) using an HMAC-signed JSON manifest plus a
content hash binding the manifest to the asset bytes. Swapping in a real C2PA
signer means re-implementing ``_sign`` / ``_verify_signature`` and
``embed_into_asset`` — the surface the rest of the app depends on is stable.

A manifest is considered VALID iff:
  1. its signature matches (not forged / not tampered), AND
  2. its ``content_hash`` matches the current bytes of the asset it claims, AND
  3. it asserts ``ai_generated = true`` and carries a synthetic-identity stamp.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.constraints import Constraint, DisclosureError

MANIFEST_VERSION = "scs-cr/1"
_ASSERTION_AI = "c2pa.ai_generated"
_ASSERTION_ACTIONS = "c2pa.actions"


@dataclass
class ProvenanceManifest:
    """A C2PA-style Content Credentials manifest."""

    asset_id: str
    persona_id: str
    synthetic_identity_id: str
    responsible_entity_id: str
    content_hash: str  # sha256 of the asset bytes the manifest is bound to
    ai_generated: bool = True
    label: str = ""
    generator: str = "synthetic-creator-studio"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    manifest_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    version: str = MANIFEST_VERSION
    assertions: dict = field(default_factory=dict)
    signature: str | None = None

    def claim_bytes(self) -> bytes:
        """Canonical, signature-excluded serialization used for signing."""
        payload = {k: v for k, v in asdict(self).items() if k != "signature"}
        return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()

    def to_dict(self) -> dict:
        return asdict(self)


class ProvenanceService:
    def __init__(self, signing_key: str | None = None, storage_dir: Path | None = None):
        settings = get_settings()
        self._key = (signing_key or settings.provenance_signing_key).encode()
        self._storage = Path(storage_dir or settings.storage_dir)
        self._storage.mkdir(parents=True, exist_ok=True)

    # ---- signing ---------------------------------------------------------
    def _sign(self, manifest: ProvenanceManifest) -> str:
        return hmac.new(self._key, manifest.claim_bytes(), hashlib.sha256).hexdigest()

    def _verify_signature(self, manifest: ProvenanceManifest) -> bool:
        if not manifest.signature:
            return False
        expected = self._sign(manifest)
        return hmac.compare_digest(expected, manifest.signature)

    # ---- hashing ---------------------------------------------------------
    @staticmethod
    def hash_bytes(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def hash_file(path: str | Path) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    # ---- public API ------------------------------------------------------
    def build_manifest(
        self,
        *,
        asset_id: str,
        persona_id: str,
        synthetic_identity_id: str,
        responsible_entity_id: str,
        content_bytes: bytes,
        label: str,
        action: str = "c2pa.created",
    ) -> ProvenanceManifest:
        """Construct and sign a manifest bound to ``content_bytes`` (C1)."""
        if not synthetic_identity_id:
            # C3/C1: cannot stamp disclosure without the synthetic-identity anchor.
            raise DisclosureError(
                Constraint.DISCLOSURE_IS_CORE,
                "cannot build provenance manifest without a synthetic_identity stamp",
            )
        manifest = ProvenanceManifest(
            asset_id=str(asset_id),
            persona_id=str(persona_id),
            synthetic_identity_id=str(synthetic_identity_id),
            responsible_entity_id=str(responsible_entity_id),
            content_hash=self.hash_bytes(content_bytes),
            label=label,
            assertions={
                _ASSERTION_AI: {"trained": True, "ai_generated": True},
                _ASSERTION_ACTIONS: [{"action": action, "softwareAgent": "synthetic-creator-studio"}],
            },
        )
        manifest.signature = self._sign(manifest)
        return manifest

    def write_sidecar(self, manifest: ProvenanceManifest) -> str:
        """Persist the manifest next to the asset; return its URI/path."""
        path = self._storage / f"{manifest.asset_id}.c2pa.json"
        path.write_text(json.dumps(manifest.to_dict(), indent=2))
        return str(path)

    @staticmethod
    def load_manifest(data: dict) -> ProvenanceManifest:
        # Ignore non-signed annotation keys (e.g. "qc") that may be stored
        # alongside the manifest for audit. Only the dataclass fields are signed,
        # so dropping extras here leaves signature verification intact.
        fields = set(ProvenanceManifest.__dataclass_fields__)
        return ProvenanceManifest(**{k: v for k, v in data.items() if k in fields})

    def verify(self, manifest: ProvenanceManifest, *, content_bytes: bytes | None = None) -> bool:
        """Return True iff signature + AI assertion (+ optional content binding) hold."""
        if not self._verify_signature(manifest):
            return False
        if not manifest.ai_generated:
            return False
        if not manifest.synthetic_identity_id:
            return False
        if content_bytes is not None:
            if self.hash_bytes(content_bytes) != manifest.content_hash:
                return False
        return True

    def assert_valid(self, manifest: ProvenanceManifest, *, content_bytes: bytes | None = None) -> None:
        """Fail-closed (C6) variant used by the gate."""
        if not self.verify(manifest, content_bytes=content_bytes):
            raise DisclosureError(
                Constraint.DISCLOSURE_IS_CORE,
                "provenance manifest is missing, forged, tampered, or unbound to the asset",
            )
