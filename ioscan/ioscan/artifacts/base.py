"""Extractor protocol, extraction context, and the extractor registry.

Adding a new artifact extractor is a one-file change: implement the
``Extractor`` protocol and decorate the class with ``@register_extractor``.
The scanner discovers everything through :data:`EXTRACTOR_REGISTRY`.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from ..console import get_logger
from ..models import Record

if TYPE_CHECKING:
    from ..backup import Backup


@dataclass
class ExtractionContext:
    """Everything an extractor needs to read artifacts.

    A backup scan populates ``backup``; a sysdiagnose scan populates
    ``fs_root``. ``work_dir`` is a scratch directory for decrypted temp files.
    """

    work_dir: Path
    backup: Backup | None = None
    fs_root: Path | None = None
    _cache: dict = field(default_factory=dict)

    def get_file(self, domain: str, relative_path: str) -> Path | None:
        """Resolve one backup artifact to a plaintext on-disk path."""
        if self.backup is None:
            return None
        entry = self.backup.get_entry(domain, relative_path)
        if entry is None:
            return None
        return self.backup.materialize(entry, self.work_dir)

    def find_files(self, domain: str, suffix: str) -> list[Path]:
        if self.backup is None:
            return []
        out = []
        for entry in self.backup.find_entries(domain, suffix):
            path = self.backup.materialize(entry, self.work_dir)
            if path is not None:
                out.append(path)
        return out

    def find_files_global(self, suffix: str) -> list[tuple[str, str, Path]]:
        """Resolve all backup files whose relativePath ends with ``suffix``.

        Returns (domain, relative_path, plaintext_path) tuples.
        """
        if self.backup is None:
            return []
        out = []
        for entry in self.backup.find_entries_global(suffix):
            path = self.backup.materialize(entry, self.work_dir)
            if path is not None:
                out.append((entry.domain, entry.relative_path, path))
        return out

    def glob(self, pattern: str) -> list[Path]:
        """Glob the sysdiagnose filesystem root (sysdiagnose scans only)."""
        if self.fs_root is None:
            return []
        return sorted(self.fs_root.glob(pattern))


@runtime_checkable
class Extractor(Protocol):
    """Protocol every artifact extractor implements."""

    name: str
    scan_types: tuple[str, ...]

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]: ...


EXTRACTOR_REGISTRY: list[type] = []


def register_extractor(cls: type) -> type:
    """Class decorator that registers an extractor implementation."""
    EXTRACTOR_REGISTRY.append(cls)
    return cls


def iter_extractors(scan_type: str) -> Iterator[Extractor]:
    """Yield instantiated extractors that apply to ``scan_type``."""
    for cls in EXTRACTOR_REGISTRY:
        inst = cls()
        if scan_type in getattr(inst, "scan_types", ()):
            yield inst


def open_sqlite_ro(path: Path) -> sqlite3.Connection:
    """Open a SQLite file read-only with row access by name."""
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def safe_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    except sqlite3.Error:
        return set()


__all__ = [
    "ExtractionContext",
    "Extractor",
    "EXTRACTOR_REGISTRY",
    "register_extractor",
    "iter_extractors",
    "open_sqlite_ro",
    "table_exists",
    "safe_columns",
    "Record",
    "get_logger",
]
