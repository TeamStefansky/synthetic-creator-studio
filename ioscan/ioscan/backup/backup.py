"""High-level backup facade.

Detects whether a backup is encrypted (via Manifest.plist), loads the keybag,
and resolves individual backed-up files lazily. Decryption is streamed in
chunks so a large file is never fully buffered in memory.
"""

from __future__ import annotations

import plistlib
import tempfile
from pathlib import Path

from Crypto.Cipher import AES

from .keybag import Keybag, KeybagError
from .manifest import FileEntry, ManifestDB

_CHUNK = 1024 * 1024  # 1 MiB streaming chunk


class BackupError(Exception):
    """Raised for backup-level failures (missing manifest, bad password, ...)."""


class Backup:
    """A read-only iOS backup directory."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.is_encrypted = False
        self._keybag: Keybag | None = None
        self._manifest_key: bytes | None = None
        self._manifest: ManifestDB | None = None
        self._info: dict = {}

    # -- lifecycle ---------------------------------------------------------
    def load(self, password: str | None = None) -> None:
        """Load Manifest.plist, unlock the keybag if encrypted, open Manifest.db."""
        manifest_plist = self.root / "Manifest.plist"
        if not manifest_plist.exists():
            raise BackupError(f"Manifest.plist not found in {self.root}")
        self._info = plistlib.loads(manifest_plist.read_bytes())
        self.is_encrypted = bool(self._info.get("IsEncrypted", False))

        if self.is_encrypted:
            if not password:
                raise BackupError("backup is encrypted; a --password is required")
            raw_keybag = self._info.get("BackupKeyBag")
            if not raw_keybag:
                raise BackupError("encrypted backup is missing BackupKeyBag")
            self._keybag = Keybag(bytes(raw_keybag))
            try:
                self._keybag.unlock_with_password(password)
            except KeybagError as exc:
                raise BackupError(f"could not unlock backup: {exc}") from exc
            self._manifest_key = self._info.get("ManifestKey")
            if self._manifest_key is not None:
                self._manifest_key = bytes(self._manifest_key)
            self._manifest = ManifestDB.open(self.root, self._keybag, self._manifest_key)
        else:
            self._manifest = ManifestDB.open(self.root)

    @property
    def manifest(self) -> ManifestDB:
        if self._manifest is None:
            raise BackupError("backup not loaded; call load() first")
        return self._manifest

    # -- file resolution ---------------------------------------------------
    def get_entry(self, domain: str, relative_path: str) -> FileEntry | None:
        return self.manifest.find(domain, relative_path)

    def find_entries(self, domain: str, suffix: str) -> list[FileEntry]:
        return self.manifest.find_by_relative_suffix(domain, suffix)

    def find_entries_global(self, suffix: str) -> list[FileEntry]:
        return self.manifest.find_by_suffix_any_domain(suffix)

    def materialize(self, entry: FileEntry, dest_dir: Path | None = None) -> Path | None:
        """Return an on-disk path to the plaintext contents of ``entry``.

        For unencrypted backups this is the original file. For encrypted
        backups the file is streamed, decrypted, into a temp file under
        ``dest_dir`` (or a system temp dir).
        """
        src = self.manifest.disk_path(entry)
        if not src.exists():
            return None
        if not self.is_encrypted or entry.encryption_key is None:
            return src
        return self._decrypt_file(entry, src, dest_dir)

    def _decrypt_file(self, entry: FileEntry, src: Path, dest_dir: Path | None) -> Path:
        assert self._keybag is not None
        if entry.protection_class is None or entry.encryption_key is None:
            raise BackupError(f"missing encryption metadata for {entry.relative_path}")
        file_key = self._keybag.unwrap_file_key(entry.protection_class, entry.encryption_key)
        cipher = AES.new(file_key, AES.MODE_CBC, iv=b"\x00" * 16)

        if dest_dir is not None:
            dest_dir.mkdir(parents=True, exist_ok=True)
            fd_dir = dest_dir
        else:
            fd_dir = Path(tempfile.mkdtemp(prefix="ioscan_"))
        dest = fd_dir / entry.file_id

        size = src.stat().st_size
        written = 0
        with src.open("rb") as fin, dest.open("wb") as fout:
            while True:
                chunk = fin.read(_CHUNK)
                if not chunk:
                    break
                plain = cipher.decrypt(chunk)
                written += len(chunk)
                if written >= size:
                    # last chunk: strip PKCS7 padding
                    pad = plain[-1] if plain else 0
                    if 1 <= pad <= 16 and plain[-pad:] == bytes([pad]) * pad:
                        plain = plain[:-pad]
                fout.write(plain)
        return dest

    def read_bytes(self, domain: str, relative_path: str) -> bytes | None:
        """Convenience: fully read a (small) file's plaintext bytes."""
        entry = self.get_entry(domain, relative_path)
        if entry is None:
            return None
        path = self.materialize(entry)
        if path is None:
            return None
        return path.read_bytes()

    def close(self) -> None:
        if self._manifest is not None:
            self._manifest.close()
        # Clean up the transient decrypted manifest, if any.
        tmp = self.root / ".Manifest.decrypted.db"
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass

    def __enter__(self) -> Backup:
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def open_backup(root: Path, password: str | None = None) -> Backup:
    backup = Backup(Path(root))
    backup.load(password)
    return backup


__all__ = ["Backup", "BackupError", "open_backup"]
