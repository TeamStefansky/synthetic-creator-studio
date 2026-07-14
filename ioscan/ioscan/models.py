"""Core dataclasses shared across ioscan."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import IntEnum
from typing import Any

from .timeutil import to_iso

_MIN_DT = datetime.min.replace(tzinfo=UTC)


class Severity(IntEnum):
    """Ordered severity levels. Higher value == more serious."""

    INFO = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3

    @classmethod
    def from_name(cls, name: str) -> Severity:
        return cls[name.strip().upper()]


@dataclass
class Record:
    """A single normalized event extracted from a forensic artifact."""

    type: str
    raw: dict[str, Any]
    source_file: str
    timestamp: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "timestamp": to_iso(self.timestamp),
            "source_file": self.source_file,
            "raw": self.raw,
        }


@dataclass
class Detection:
    """A finding produced by the IOC engine or a heuristic rule."""

    severity: Severity
    source: str  # artifact / extractor that produced the matched record
    matched_value: str
    description: str
    ioc_id: str | None = None  # STIX indicator id when IOC-based
    rule: str | None = None  # heuristic rule name when rule-based
    timestamp: datetime | None = None
    record_type: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity.name,
            "source": self.source,
            "matched_value": self.matched_value,
            "description": self.description,
            "ioc_id": self.ioc_id,
            "rule": self.rule,
            "timestamp": to_iso(self.timestamp),
            "record_type": self.record_type,
        }


@dataclass
class ScanNote:
    """Non-fatal note recorded when an extractor is skipped or fails."""

    level: str  # "INFO" / "WARNING"
    source: str
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {"level": self.level, "source": self.source, "message": self.message}


@dataclass
class ScanResult:
    """Aggregate result of a scan run."""

    target: str
    scan_type: str  # "backup" | "sysdiagnose"
    detections: list[Detection] = field(default_factory=list)
    records: list[Record] = field(default_factory=list)
    notes: list[ScanNote] = field(default_factory=list)
    started_at: datetime | None = None
    finished_at: datetime | None = None

    def add_detection(self, det: Detection) -> None:
        self.detections.append(det)

    def add_note(self, level: str, source: str, message: str) -> None:
        self.notes.append(ScanNote(level=level, source=source, message=message))

    @property
    def highest_severity(self) -> Severity | None:
        if not self.detections:
            return None
        return max(d.severity for d in self.detections)

    @property
    def verdict(self) -> str:
        top = self.highest_severity
        if top is None or top <= Severity.INFO:
            return "Clean"
        if top >= Severity.HIGH:
            return "Compromise indicators found"
        return "Suspicious"

    def sorted_detections(self) -> list[Detection]:
        return sorted(
            self.detections,
            key=lambda d: (-int(d.severity), d.timestamp or _MIN_DT),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "scan_type": self.scan_type,
            "verdict": self.verdict,
            "started_at": to_iso(self.started_at),
            "finished_at": to_iso(self.finished_at),
            "detection_count": len(self.detections),
            "detections": [d.to_dict() for d in self.sorted_detections()],
            "notes": [n.to_dict() for n in self.notes],
        }
