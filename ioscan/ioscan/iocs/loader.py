"""STIX2 IOC loader.

IOCs are never hardcoded in Python; they are loaded from STIX2 bundles
(compatible with Amnesty's MVT indicator format). Indicators are parsed into
lightweight :class:`Ioc` objects keyed by type so matchers can look them up
efficiently.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

# Recognized IOC types.
IOC_DOMAIN = "domain"
IOC_URL = "url"
IOC_PROCESS = "process"
IOC_PATH = "path"
IOC_BUNDLE_ID = "bundle_id"
IOC_EMAIL = "email"
IOC_SHA1 = "sha1"
IOC_SHA256 = "sha256"

ALL_IOC_TYPES = (
    IOC_DOMAIN,
    IOC_URL,
    IOC_PROCESS,
    IOC_PATH,
    IOC_BUNDLE_ID,
    IOC_EMAIL,
    IOC_SHA1,
    IOC_SHA256,
)


class IocError(Exception):
    """Raised when a STIX2 IOC file cannot be parsed."""


@dataclass
class Ioc:
    """A single indicator of compromise."""

    type: str
    value: str
    ioc_id: str
    name: str | None = None
    severity: str = "HIGH"


@dataclass
class IocBundle:
    """A parsed collection of IOCs indexed by type."""

    by_type: dict[str, list[Ioc]] = field(default_factory=dict)

    def add(self, ioc: Ioc) -> None:
        self.by_type.setdefault(ioc.type, []).append(ioc)

    def get(self, ioc_type: str) -> list[Ioc]:
        return self.by_type.get(ioc_type, [])

    @property
    def total(self) -> int:
        return sum(len(v) for v in self.by_type.values())

    def merge(self, other: IocBundle) -> None:
        for ioc_type, iocs in other.by_type.items():
            self.by_type.setdefault(ioc_type, []).extend(iocs)


# STIX pattern property -> ioc type mapping.
_STIX_PROP_MAP = {
    "domain-name:value": IOC_DOMAIN,
    "url:value": IOC_URL,
    "process:name": IOC_PROCESS,
    "process:command_line": IOC_PROCESS,
    "file:name": IOC_PATH,
    "directory:path": IOC_PATH,
    "file:hashes.'SHA-1'": IOC_SHA1,
    "file:hashes.sha-1": IOC_SHA1,
    "file:hashes.'SHA-256'": IOC_SHA256,
    "file:hashes.sha-256": IOC_SHA256,
    "email-addr:value": IOC_EMAIL,
    "app:bundle_id": IOC_BUNDLE_ID,
}

_PATTERN_RE = re.compile(r"(?P<prop>[a-zA-Z0-9_\-:.'\" ]+?)\s*=\s*'(?P<value>[^']*)'")


def _parse_pattern(pattern: str) -> list[tuple[str, str]]:
    """Extract (stix_property, value) comparisons from a STIX pattern string."""
    out = []
    for m in _PATTERN_RE.finditer(pattern or ""):
        prop = m.group("prop").strip().lstrip("[(").strip()
        out.append((prop, m.group("value")))
    return out


def _map_prop_to_type(prop: str) -> str | None:
    key = prop.strip()
    if key in _STIX_PROP_MAP:
        return _STIX_PROP_MAP[key]
    low = key.lower()
    for known, ioc_type in _STIX_PROP_MAP.items():
        if known.lower() == low:
            return ioc_type
    if "bundle_id" in low or "bundle-id" in low:
        return IOC_BUNDLE_ID
    return None


def load_iocs(paths: list[Path]) -> IocBundle:
    """Load and merge one or more STIX2 IOC files into a single bundle."""
    bundle = IocBundle()
    for path in paths:
        bundle.merge(_load_one(Path(path)))
    return bundle


def _load_one(path: Path) -> IocBundle:
    try:
        raw = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise IocError(f"cannot read STIX2 file {path}: {exc}") from exc
    if not isinstance(raw, dict) or raw.get("type") != "bundle":
        raise IocError(f"{path} is not a STIX2 bundle")

    bundle = IocBundle()
    for obj in raw.get("objects", []):
        if not isinstance(obj, dict) or obj.get("type") != "indicator":
            continue
        ioc_id = obj.get("id", "indicator--unknown")
        name = obj.get("name")
        severity = _severity_from_labels(obj.get("labels", []))
        pattern = obj.get("pattern", "")
        for prop, value in _parse_pattern(pattern):
            ioc_type = _map_prop_to_type(prop)
            if ioc_type is None or not value:
                continue
            bundle.add(
                Ioc(
                    type=ioc_type,
                    value=value,
                    ioc_id=ioc_id,
                    name=name,
                    severity=severity,
                )
            )
    return bundle


def _severity_from_labels(labels) -> str:
    for label in labels or []:
        low = str(label).lower()
        if low in {"low", "medium", "high", "info"}:
            return low.upper()
    return "HIGH"


def summarize_iocs(bundle: IocBundle) -> dict:
    return {
        "total": bundle.total,
        "by_type": {k: len(v) for k, v in bundle.by_type.items()},
    }
