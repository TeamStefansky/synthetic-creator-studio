"""Per-type IOC matchers.

Each record is reduced to a set of candidate values grouped by IOC type; those
candidates are matched against the loaded IOC bundle to produce Detections.
Matching rules are type-aware (e.g. domain matches include subdomains; hashes
match case-insensitively).
"""

from __future__ import annotations

from collections.abc import Iterator
from urllib.parse import urlparse

from ..models import Detection, Record, Severity
from .loader import (
    IOC_BUNDLE_ID,
    IOC_DOMAIN,
    IOC_EMAIL,
    IOC_PATH,
    IOC_PROCESS,
    IOC_SHA1,
    IOC_SHA256,
    IOC_URL,
    Ioc,
    IocBundle,
)


def host_of(url: str) -> str | None:
    if not url:
        return None
    try:
        netloc = urlparse(url).netloc or urlparse("//" + url).netloc
    except ValueError:
        return None
    if not netloc:
        return None
    host = netloc.split("@")[-1].split(":")[0].lower().strip(".")
    return host or None


def _domain_matches(candidate: str, ioc_value: str) -> bool:
    c = candidate.lower().strip(".")
    v = ioc_value.lower().strip(".")
    return c == v or c.endswith("." + v)


def _extract_candidates(record: Record) -> dict[str, list[str]]:
    """Map IOC type -> candidate string values found in this record."""
    raw = record.raw
    out: dict[str, list[str]] = {}

    def add(ioc_type: str, value) -> None:
        if value:
            out.setdefault(ioc_type, []).append(str(value))

    rtype = record.type
    if rtype == "network_usage":
        add(IOC_PROCESS, raw.get("process"))
        add(IOC_BUNDLE_ID, raw.get("bundle"))
    elif rtype == "safari_history":
        url = raw.get("url")
        add(IOC_URL, url)
        add(IOC_DOMAIN, host_of(url or ""))
    elif rtype == "webkit_observed_domain":
        add(IOC_DOMAIN, raw.get("domain"))
    elif rtype == "sms_message":
        for link in raw.get("links", []) or []:
            add(IOC_URL, link)
            add(IOC_DOMAIN, host_of(link))
        add(IOC_EMAIL, raw.get("handle") if "@" in str(raw.get("handle") or "") else None)
    elif rtype in {"crash_report", "jetsam_event"}:
        add(IOC_PROCESS, raw.get("process"))
        for proc in raw.get("jetsam_processes", []) or []:
            add(IOC_PROCESS, proc)
    elif rtype == "installed_app":
        add(IOC_BUNDLE_ID, raw.get("bundle_id"))
        add(IOC_PATH, raw.get("path"))
        add(IOC_SHA1, raw.get("sha1"))
        add(IOC_SHA256, raw.get("sha256"))
    elif rtype == "config_profile":
        add(IOC_BUNDLE_ID, raw.get("identifier"))
    elif rtype in {"tcc_entry", "process_launch", "shutdown_process"}:
        add(IOC_PROCESS, raw.get("process") or raw.get("service"))
        add(IOC_PATH, raw.get("path"))
    # Generic: any explicit url/domain/path fields.
    add(IOC_URL, raw.get("url"))
    add(IOC_PATH, raw.get("path"))
    return out


def _match_value(ioc_type: str, candidate: str, ioc: Ioc) -> bool:
    if ioc_type == IOC_DOMAIN:
        return _domain_matches(candidate, ioc.value)
    if ioc_type == IOC_URL:
        return ioc.value.lower() in candidate.lower() or candidate.lower() == ioc.value.lower()
    if ioc_type in {IOC_SHA1, IOC_SHA256}:
        return candidate.lower() == ioc.value.lower()
    if ioc_type in {IOC_BUNDLE_ID, IOC_EMAIL, IOC_PATH}:
        return candidate == ioc.value or candidate.lower() == ioc.value.lower()
    if ioc_type == IOC_PROCESS:
        cand = candidate.lower()
        val = ioc.value.lower()
        if cand == val:
            return True
        # A process IOC (a name) may appear as a full path in ps/shutdown data.
        basename = cand.rsplit("/", 1)[-1].split()[0] if cand else cand
        return basename == val
    return candidate == ioc.value


def match_record(record: Record, bundle: IocBundle) -> Iterator[Detection]:
    candidates = _extract_candidates(record)
    for ioc_type, values in candidates.items():
        iocs = bundle.get(ioc_type)
        if not iocs:
            continue
        for candidate in values:
            for ioc in iocs:
                if _match_value(ioc_type, candidate, ioc):
                    yield Detection(
                        severity=Severity.from_name(ioc.severity),
                        source=record.source_file,
                        matched_value=candidate,
                        description=(
                            f"{ioc_type} IOC match" + (f" ({ioc.name})" if ioc.name else "")
                        ),
                        ioc_id=ioc.ioc_id,
                        timestamp=record.timestamp,
                        record_type=record.type,
                    )
