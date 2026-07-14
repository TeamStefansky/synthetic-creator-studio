"""Scan orchestration for backups and sysdiagnose archives.

Each extractor runs in isolation: a failure in one artifact is recorded as an
INFO note and never aborts the scan. No network access happens here - IOC
feeds must be fetched beforehand.
"""

from __future__ import annotations

import tempfile
from datetime import UTC, datetime
from pathlib import Path

from .artifacts import ExtractionContext, iter_extractors
from .backup import BackupError, open_backup
from .console import get_logger
from .heuristics import run_heuristics
from .iocs import load_iocs, run_iocs
from .models import Record, ScanResult


def _collect_records(ctx: ExtractionContext, scan_type: str, result: ScanResult) -> list[Record]:
    logger = get_logger()
    records: list[Record] = []
    for extractor in iter_extractors(scan_type):
        try:
            produced = list(extractor.extract(ctx))
            records.extend(produced)
            logger.debug("extractor %s produced %d records", extractor.name, len(produced))
        except Exception as exc:  # noqa: BLE001 - isolate every extractor
            result.add_note("INFO", extractor.name, f"extractor failed: {exc}")
            logger.debug("extractor %s failed: %s", extractor.name, exc)
    return records


def _run_engines(
    records: list[Record], ioc_paths: list[Path], scan_type: str, result: ScanResult
) -> None:
    if ioc_paths:
        try:
            bundle = load_iocs(ioc_paths)
            for det in run_iocs(records, bundle):
                result.add_detection(det)
        except Exception as exc:  # noqa: BLE001
            result.add_note("WARNING", "iocs", f"IOC engine failed: {exc}")
    else:
        result.add_note("INFO", "iocs", "no IOC files supplied; ran heuristics only")
    try:
        for det in run_heuristics(records, scan_type):
            result.add_detection(det)
    except Exception as exc:  # noqa: BLE001
        result.add_note("WARNING", "heuristics", f"heuristic engine failed: {exc}")


def scan_backup(
    backup_path: Path,
    ioc_paths: list[Path] | None = None,
    password: str | None = None,
) -> ScanResult:
    backup_path = Path(backup_path)
    result = ScanResult(
        target=str(backup_path),
        scan_type="backup",
        started_at=datetime.now(UTC),
    )
    ioc_paths = [Path(p) for p in (ioc_paths or [])]
    try:
        backup = open_backup(backup_path, password=password)
    except BackupError as exc:
        result.add_note("WARNING", "backup", str(exc))
        result.finished_at = datetime.now(UTC)
        raise
    with backup, tempfile.TemporaryDirectory(prefix="ioscan_work_") as work:
        ctx = ExtractionContext(work_dir=Path(work), backup=backup)
        records = _collect_records(ctx, "backup", result)
        result.records = records
        _run_engines(records, ioc_paths, "backup", result)
    result.finished_at = datetime.now(UTC)
    return result


def scan_sysdiagnose(
    sysdiagnose_path: Path,
    ioc_paths: list[Path] | None = None,
) -> ScanResult:
    sysdiagnose_path = Path(sysdiagnose_path)
    result = ScanResult(
        target=str(sysdiagnose_path),
        scan_type="sysdiagnose",
        started_at=datetime.now(UTC),
    )
    ioc_paths = [Path(p) for p in (ioc_paths or [])]
    with tempfile.TemporaryDirectory(prefix="ioscan_work_") as work:
        ctx = ExtractionContext(work_dir=Path(work), fs_root=sysdiagnose_path)
        records = _collect_records(ctx, "sysdiagnose", result)
        result.records = records
        _run_engines(records, ioc_paths, "sysdiagnose", result)
    result.finished_at = datetime.now(UTC)
    return result
