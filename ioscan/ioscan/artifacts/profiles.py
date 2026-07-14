"""Configuration / MDM profile extractor.

Installed configuration profiles are unusual on consumer devices and are a
common stalkerware / unauthorized-management vector. Any profile carrying an
``com.apple.mdm`` payload is flagged especially hard by the heuristics.

# TODO(verify-schema): profiles are stored under
# /var/installd or the configurationprofiles group container as a plist. The
# exact backup domain/path varies by iOS version; confirm before production
# use. This extractor accepts either a list-of-profiles plist or a dict with a
# 'ProfileMetadata' mapping.
"""

from __future__ import annotations

import plistlib
from collections.abc import Iterator

from ..models import Record
from .base import ExtractionContext, register_extractor

PROFILE_DOMAIN = "SysSharedContainerDomain-systemgroup.com.apple.configurationprofiles"
PROFILE_PATHS = [
    "Library/ConfigurationProfiles/ProfileList.plist",
    "Library/ConfigurationProfiles/MDM_ComputerIdentities.plist",
]


def _payload_has_mdm(profile: dict) -> bool:
    for payload in profile.get("PayloadContent", []) or []:
        if isinstance(payload, dict) and payload.get("PayloadType") == "com.apple.mdm":
            return True
    return "com.apple.mdm" in str(profile.get("PayloadType", ""))


def _iter_profiles(data) -> Iterator[dict]:
    if isinstance(data, list):
        yield from (p for p in data if isinstance(p, dict))
    elif isinstance(data, dict):
        meta = data.get("ProfileMetadata")
        if isinstance(meta, dict):
            for identifier, p in meta.items():
                if isinstance(p, dict):
                    p = {**p, "PayloadIdentifier": p.get("PayloadIdentifier", identifier)}
                    yield p
        elif "PayloadIdentifier" in data:
            yield data


@register_extractor
class ConfigProfileExtractor:
    name = "config_profiles"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        for rel in PROFILE_PATHS:
            path = ctx.get_file(PROFILE_DOMAIN, rel)
            if path is None:
                continue
            try:
                data = plistlib.loads(path.read_bytes())
            except Exception:  # noqa: BLE001
                continue
            for profile in _iter_profiles(data):
                yield Record(
                    type="config_profile",
                    timestamp=None,
                    source_file=rel,
                    raw={
                        "identifier": profile.get("PayloadIdentifier"),
                        "display_name": profile.get("PayloadDisplayName"),
                        "organization": profile.get("PayloadOrganization"),
                        "has_mdm": _payload_has_mdm(profile),
                    },
                )
