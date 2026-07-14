"""Manifest.db access: map (domain, relativePath) -> on-disk fileID.

In an iOS backup, every backed-up file is stored on disk as
``<backup>/<fileID[:2]>/<fileID>`` where ``fileID`` is the SHA-1 of
``<domain>-<relativePath>``. Manifest.db (a SQLite database) holds the
mapping plus per-file metadata (the ``file`` BLOB column).
"""

from __future__ import annotations

import plistlib
import sqlite3
import struct
from dataclasses import dataclass
from pathlib import Path

from .keybag import Keybag, decrypt_cbc


@dataclass
class FileEntry:
    """One row of the Manifest.db Files table."""

    file_id: str
    domain: str
    relative_path: str
    flags: int
    protection_class: int | None = None
    encryption_key: bytes | None = None

    @property
    def is_file(self) -> bool:
        return self.flags == 1


def parse_mbfile(blob: bytes | None) -> tuple[int | None, bytes | None]:
    """Extract (ProtectionClass, wrapped EncryptionKey) from a file metadata blob.

    Real backups store this column as an ``NSKeyedArchiver`` ``MBFile`` object.
    ioscan supports the plain-plist-dict form used by its synthetic fixtures and
    degrades gracefully otherwise.

    # TODO(verify-schema): implement NSKeyedArchiver MBFile extraction to read
    # ProtectionClass / EncryptionKey from genuine iOS backups (see MVT's
    # mvt/ios/backup for a reference decoder).
    """
    if not blob:
        return None, None
    try:
        data = plistlib.loads(blob)
    except Exception:  # noqa: BLE001 - non-plist / archiver blob
        return None, None
    if isinstance(data, dict):
        pc = data.get("ProtectionClass")
        key = data.get("EncryptionKey")
        if isinstance(key, (bytes, bytearray)):
            key = bytes(key)
        else:
            key = None
        return (int(pc) if pc is not None else None), key
    return None, None


class ManifestDB:
    """Read-only access to a backup's Manifest.db."""

    def __init__(self, conn: sqlite3.Connection, backup_root: Path, keybag: Keybag | None) -> None:
        self._conn = conn
        self._root = backup_root
        self._keybag = keybag

    @classmethod
    def open(
        cls,
        backup_root: Path,
        keybag: Keybag | None = None,
        manifest_key: bytes | None = None,
    ) -> ManifestDB:
        """Open Manifest.db, transparently decrypting it when a keybag is given."""
        db_path = backup_root / "Manifest.db"
        if not db_path.exists():
            raise FileNotFoundError(f"Manifest.db not found in {backup_root}")
        if keybag is not None and manifest_key is not None:
            plain = cls._decrypt_manifest(db_path, keybag, manifest_key)
            # Load the decrypted bytes into an in-memory database.
            tmp = backup_root / ".Manifest.decrypted.db"
            tmp.write_bytes(plain)
            conn = sqlite3.connect(str(tmp))
        else:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return cls(conn, backup_root, keybag)

    @staticmethod
    def _decrypt_manifest(db_path: Path, keybag: Keybag, manifest_key: bytes) -> bytes:
        # ManifestKey = 4-byte protection class + wrapped AES key.
        protection_class = struct.unpack("<I", manifest_key[:4])[0]
        wrapped = manifest_key[4:]
        file_key = keybag.unwrap_file_key(protection_class, wrapped)
        return decrypt_cbc(file_key, db_path.read_bytes(), unpad=False)

    def iter_files(self):
        cur = self._conn.execute("SELECT fileID, domain, relativePath, flags, file FROM Files")
        for row in cur:
            pc, key = parse_mbfile(row["file"])
            yield FileEntry(
                file_id=row["fileID"],
                domain=row["domain"],
                relative_path=row["relativePath"] or "",
                flags=row["flags"] or 0,
                protection_class=pc,
                encryption_key=key,
            )

    def find(self, domain: str, relative_path: str) -> FileEntry | None:
        row = self._conn.execute(
            "SELECT fileID, domain, relativePath, flags, file FROM Files "
            "WHERE domain = ? AND relativePath = ?",
            (domain, relative_path),
        ).fetchone()
        if row is None:
            return None
        pc, key = parse_mbfile(row["file"])
        return FileEntry(
            file_id=row["fileID"],
            domain=row["domain"],
            relative_path=row["relativePath"] or "",
            flags=row["flags"] or 0,
            protection_class=pc,
            encryption_key=key,
        )

    def find_by_relative_suffix(self, domain: str, suffix: str) -> list[FileEntry]:
        rows = self._conn.execute(
            "SELECT fileID, domain, relativePath, flags, file FROM Files "
            "WHERE domain = ? AND relativePath LIKE ?",
            (domain, f"%{suffix}"),
        ).fetchall()
        out = []
        for row in rows:
            pc, key = parse_mbfile(row["file"])
            out.append(
                FileEntry(
                    file_id=row["fileID"],
                    domain=row["domain"],
                    relative_path=row["relativePath"] or "",
                    flags=row["flags"] or 0,
                    protection_class=pc,
                    encryption_key=key,
                )
            )
        return out

    def find_by_suffix_any_domain(self, suffix: str) -> list[FileEntry]:
        rows = self._conn.execute(
            "SELECT fileID, domain, relativePath, flags, file FROM Files WHERE relativePath LIKE ?",
            (f"%{suffix}",),
        ).fetchall()
        out = []
        for row in rows:
            pc, key = parse_mbfile(row["file"])
            out.append(
                FileEntry(
                    file_id=row["fileID"],
                    domain=row["domain"],
                    relative_path=row["relativePath"] or "",
                    flags=row["flags"] or 0,
                    protection_class=pc,
                    encryption_key=key,
                )
            )
        return out

    def disk_path(self, entry: FileEntry) -> Path:
        return self._root / entry.file_id[:2] / entry.file_id

    def close(self) -> None:
        self._conn.close()
