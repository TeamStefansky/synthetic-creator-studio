"""Built-in heuristic anomaly rules."""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence

from ..models import Detection, Record, Severity
from .base import register_heuristic

# Crash signatures that, when crashing repeatedly, suggest exploitation.
HIGH_RISK_CRASH_PROCS = {
    "webkit",
    "com.apple.webkit",
    "webkit.networking",
    "assetsd",
    "imtransferagent",
    "mediaserverd",
    "identityservicesd",
    "assistantd",
}

# Markers that indicate a jailbroken device.
JAILBREAK_MARKERS = (
    "cydia",
    "sileo",
    "zebra",
    "com.saurik",
    "unc0ver",
    "checkra1n",
    "taurine",
    "/private/var/lib/apt",
    "/bin/bash",
    "frida",
    "substrate",
)

_ALNUM = re.compile(r"[^a-z0-9]")
_VOWELS = set("aeiou")


def _looks_random(name: str) -> bool:
    token = _ALNUM.sub("", name.lower())
    if len(token) < 8:
        return False
    letters = [c for c in token if c.isalpha()]
    digits = [c for c in token if c.isdigit()]
    vowel_ratio = (sum(c in _VOWELS for c in letters) / len(letters)) if letters else 0.0
    digit_ratio = len(digits) / len(token)
    return vowel_ratio < 0.12 or digit_ratio > 0.4


def _impersonates_apple(name: str) -> bool:
    low = name.lower()
    if "apple" not in low:
        # look-alike spellings
        return any(m in low for m in ("app1e", "appl3", "аpple"))
    # Genuine Apple identifiers are 'com.apple.<...>'.
    return not low.startswith("com.apple.")


@register_heuristic
class SuspiciousProcessNameRule:
    name = "suspicious_process_name"
    scan_types = ("backup", "sysdiagnose")

    def evaluate(self, records: Sequence[Record]) -> Iterator[Detection]:
        for rec in records:
            if rec.type not in {"network_usage", "process_launch", "shutdown_process"}:
                continue
            proc = rec.raw.get("process")
            if not proc:
                continue
            reason = None
            if _impersonates_apple(str(proc)):
                reason = "process name impersonates an Apple/system component"
            elif _looks_random(str(proc)):
                reason = "process name looks randomly generated"
            if reason:
                yield Detection(
                    severity=Severity.MEDIUM,
                    source=rec.source_file,
                    matched_value=str(proc),
                    description=reason,
                    rule=self.name,
                    timestamp=rec.timestamp,
                    record_type=rec.type,
                )


@register_heuristic
class HighRiskCrashRule:
    name = "high_risk_crash"
    scan_types = ("backup", "sysdiagnose")

    def evaluate(self, records: Sequence[Record]) -> Iterator[Detection]:
        for rec in records:
            if rec.type != "crash_report":
                continue
            proc = str(rec.raw.get("process") or "").lower()
            if not proc:
                continue
            if any(sig in proc for sig in HIGH_RISK_CRASH_PROCS):
                yield Detection(
                    severity=Severity.MEDIUM,
                    source=rec.source_file,
                    matched_value=rec.raw.get("process"),
                    description="crash in a security-sensitive process (possible exploitation)",
                    rule=self.name,
                    timestamp=rec.timestamp,
                    record_type=rec.type,
                )


@register_heuristic
class UnexpectedConfigProfileRule:
    name = "unexpected_config_profile"
    scan_types = ("backup", "sysdiagnose")

    def evaluate(self, records: Sequence[Record]) -> Iterator[Detection]:
        for rec in records:
            if rec.type != "config_profile":
                continue
            identifier = rec.raw.get("identifier") or ""
            has_mdm = bool(rec.raw.get("has_mdm"))
            severity = Severity.HIGH if has_mdm else Severity.MEDIUM
            desc = (
                "configuration profile enrolls the device in MDM"
                if has_mdm
                else "unexpected configuration profile installed"
            )
            yield Detection(
                severity=severity,
                source=rec.source_file,
                matched_value=identifier,
                description=desc,
                rule=self.name,
                timestamp=rec.timestamp,
                record_type=rec.type,
            )


@register_heuristic
class StickyShutdownProcessRule:
    """Triangulation technique: a process repeatedly delaying data-volume unmount."""

    name = "sticky_shutdown_process"
    scan_types = ("sysdiagnose",)
    # A client seen delaying unmount across this many shutdowns is suspicious.
    THRESHOLD = 2

    def evaluate(self, records: Sequence[Record]) -> Iterator[Detection]:
        for rec in records:
            if rec.type != "shutdown_process":
                continue
            count = int(rec.raw.get("count") or 0)
            proc = rec.raw.get("process") or ""
            if count >= self.THRESHOLD:
                yield Detection(
                    severity=Severity.MEDIUM,
                    source=rec.source_file,
                    matched_value=proc,
                    description=(
                        f"process delayed data-volume unmount across {count} shutdowns "
                        "(Triangulation sticky-process indicator)"
                    ),
                    rule=self.name,
                    timestamp=rec.timestamp,
                    record_type=rec.type,
                )


@register_heuristic
class JailbreakTraceRule:
    name = "jailbreak_trace"
    scan_types = ("backup", "sysdiagnose")

    def evaluate(self, records: Sequence[Record]) -> Iterator[Detection]:
        for rec in records:
            haystack = " ".join(
                str(rec.raw.get(k) or "")
                for k in ("process", "path", "bundle_id", "identifier", "service")
            ).lower()
            if not haystack.strip():
                continue
            for marker in JAILBREAK_MARKERS:
                if marker in haystack:
                    yield Detection(
                        severity=Severity.HIGH,
                        source=rec.source_file,
                        matched_value=marker,
                        description="jailbreak / device-tampering trace detected",
                        rule=self.name,
                        timestamp=rec.timestamp,
                        record_type=rec.type,
                    )
                    break
