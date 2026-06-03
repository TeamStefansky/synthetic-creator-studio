"""DisclosureGate — the server-side gate for C1/C2.

``assert_publishable(asset)`` raises unless the asset is fully disclosed:
  - ``disclosure_status == tagged``,
  - a provenance manifest is present and binds to THIS asset,
  - the provenance backend verifies integrity + the AI assertion against the
    asset bytes (HMAC: signed manifest + content hash; C2PA: embedded Content
    Credentials read back from the bytes).

This is a hard dependency of the distribution module — ``publish()`` calls it
*before* contacting any platform. It is storage-aware so it re-verifies against
the asset bytes on disk (defense in depth), not just the cached status flag.
"""
from __future__ import annotations

from pathlib import Path

from app.constraints import Constraint, DisclosureError
from app.disclosure.backends import ProvenanceBackend, get_provenance_backend
from app.disclosure.provenance import ProvenanceService
from app.models.asset import Asset, DisclosureStatus


class DisclosureGate:
    def __init__(
        self,
        provenance: ProvenanceService | None = None,
        *,
        backend: ProvenanceBackend | None = None,
    ):
        if backend is not None:
            self.backend = backend
        elif provenance is not None:
            from app.disclosure.backends import HmacProvenanceBackend

            self.backend = HmacProvenanceBackend(provenance)
        else:
            self.backend = get_provenance_backend()

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

        # Re-read the actual bytes to re-verify the binding (tamper check).
        signed_bytes = None
        if asset.storage_uri and Path(asset.storage_uri).exists():
            signed_bytes = Path(asset.storage_uri).read_bytes()

        ok = self.backend.verify_asset(
            manifest=asset.provenance_manifest,
            signed_bytes=signed_bytes,
            asset_id=str(asset.id),
        )
        if not ok:
            raise DisclosureError(
                Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE,
                f"asset {asset.id} provenance is missing, forged, tampered, unbound, "
                "or not asserted AI-generated — failing closed",
            )

    def is_publishable(self, asset: Asset) -> bool:
        try:
            self.assert_publishable(asset)
            return True
        except DisclosureError:
            return False
