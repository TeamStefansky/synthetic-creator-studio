"""DisclosureGate — the server-side gate for C1/C2.

``assert_publishable(asset)`` raises unless the asset is fully disclosed:
  - ``disclosure_status == tagged``,
  - a provenance manifest is present, valid, signed, and bound to the bytes,
  - the manifest asserts AI generation + a synthetic-identity stamp.

This is a hard dependency of the distribution module — ``publish()`` calls it
*before* contacting any platform. It is intentionally storage-aware so it
re-verifies the manifest against the asset bytes on disk (defense in depth),
not just the cached status flag.
"""
from __future__ import annotations

from pathlib import Path

from app.constraints import Constraint, DisclosureError
from app.disclosure.provenance import ProvenanceService
from app.models.asset import Asset, DisclosureStatus


class DisclosureGate:
    def __init__(self, provenance: ProvenanceService | None = None):
        self.provenance = provenance or ProvenanceService()

    def assert_publishable(self, asset: Asset) -> None:
        """Fail closed (C6) unless ``asset`` is fully disclosed (C1/C2)."""
        if asset.disclosure_status == DisclosureStatus.BLOCKED:
            raise DisclosureError(
                Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE,
                f"asset {asset.id} is BLOCKED and may never be published",
            )
        if asset.disclosure_status != DisclosureStatus.TAGGED:
            raise DisclosureError(
                Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE,
                f"asset {asset.id} is '{asset.disclosure_status.value}', not 'tagged' — "
                "no publish without disclosure",
            )
        if not asset.provenance_manifest:
            raise DisclosureError(
                Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE,
                f"asset {asset.id} has no provenance manifest",
            )

        manifest = self.provenance.load_manifest(asset.provenance_manifest)

        # Re-bind to the actual bytes when we still have them (tamper check).
        content_bytes = None
        if asset.storage_uri and Path(asset.storage_uri).exists():
            content_bytes = Path(asset.storage_uri).read_bytes()

        self.provenance.assert_valid(manifest, content_bytes=content_bytes)

        # Cross-check the manifest actually describes THIS asset.
        if str(manifest.asset_id) != str(asset.id):
            raise DisclosureError(
                Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE,
                f"manifest asset_id {manifest.asset_id} does not match asset {asset.id}",
            )

    def is_publishable(self, asset: Asset) -> bool:
        try:
            self.assert_publishable(asset)
            return True
        except DisclosureError:
            return False
