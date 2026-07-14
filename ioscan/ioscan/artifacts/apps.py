"""Installed applications + iTunes metadata extractor.

Enumerates installed apps (bundle id, install path, optional hashes and
iTunes metadata) so bundle-id / path / hash IOCs and jailbreak-store markers
(Cydia, Sileo, Zebra) can be matched.

# TODO(verify-schema): the backup Info.plist lists installed apps under
# 'Installed Applications'; richer per-app metadata lives in each app's
# iTunesMetadata.plist. This extractor reads a consolidated 'Applications'
# plist mapping bundle_id -> metadata (the form produced by ioscan fixtures)
# and the backup-level Info.plist list. Confirm real layout before production.
"""

from __future__ import annotations

import plistlib
from collections.abc import Iterator

from ..models import Record
from .base import ExtractionContext, register_extractor

APPS_DOMAIN = "RootDomain"
APPS_PATHS = [
    "Library/ioscan/Applications.plist",
    "iTunesMetadata.plist",
]


@register_extractor
class InstalledAppsExtractor:
    name = "installed_apps"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        # Backup-level Info.plist installed-applications list.
        info = ctx.get_file("RootDomain", "Info.plist")
        seen: set[str] = set()
        for rel in APPS_PATHS:
            path = ctx.get_file(APPS_DOMAIN, rel)
            if path is None:
                continue
            try:
                data = plistlib.loads(path.read_bytes())
            except Exception:  # noqa: BLE001
                continue
            yield from self._from_apps_plist(data, rel, seen)
        if info is not None:
            try:
                data = plistlib.loads(info.read_bytes())
            except Exception:  # noqa: BLE001
                data = {}
            for bundle_id in data.get("Installed Applications", []) or []:
                if bundle_id in seen:
                    continue
                seen.add(bundle_id)
                yield Record(
                    type="installed_app",
                    timestamp=None,
                    source_file="Info.plist",
                    raw={"bundle_id": bundle_id},
                )

    def _from_apps_plist(self, data, rel, seen) -> Iterator[Record]:
        apps = data.get("Applications") if isinstance(data, dict) else None
        if not isinstance(apps, dict):
            return
        for bundle_id, meta in apps.items():
            if bundle_id in seen:
                continue
            seen.add(bundle_id)
            meta = meta if isinstance(meta, dict) else {}
            yield Record(
                type="installed_app",
                timestamp=None,
                source_file=rel,
                raw={
                    "bundle_id": bundle_id,
                    "name": meta.get("itemName") or meta.get("name"),
                    "path": meta.get("Path") or meta.get("path"),
                    "sha1": meta.get("sha1"),
                    "sha256": meta.get("sha256"),
                },
            )
