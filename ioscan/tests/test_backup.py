"""Phase 1: backup access (unencrypted + encrypted) tests."""

from __future__ import annotations

import pytest
from factories import DOMAIN_SMS, build_encrypted_backup, build_unencrypted_backup

from ioscan.backup import BackupError, open_backup


def test_unencrypted_resolution(tmp_path):
    files = {
        (DOMAIN_SMS, "Library/SMS/sms.db"): b"hello world",
        ("RootDomain", "Library/Preferences/test.plist"): b"abc",
    }
    root = build_unencrypted_backup(tmp_path / "bk", files)
    with open_backup(root) as bk:
        assert bk.is_encrypted is False
        data = bk.read_bytes(DOMAIN_SMS, "Library/SMS/sms.db")
        assert data == b"hello world"
        entry = bk.get_entry("RootDomain", "Library/Preferences/test.plist")
        assert entry is not None
        # fileID directory layout <first2>/<fileID>
        disk = bk.manifest.disk_path(entry)
        assert disk.parent.name == entry.file_id[:2]


def test_encrypted_roundtrip(tmp_path):
    content = b"SECRET diagnostic payload " * 100
    files = {(DOMAIN_SMS, "Library/SMS/sms.db"): content}
    root = build_encrypted_backup(tmp_path / "enc", files, password="hunter2")
    with open_backup(root, password="hunter2") as bk:
        assert bk.is_encrypted is True
        data = bk.read_bytes(DOMAIN_SMS, "Library/SMS/sms.db")
        assert data == content


def test_encrypted_wrong_password(tmp_path):
    files = {(DOMAIN_SMS, "Library/SMS/sms.db"): b"data"}
    root = build_encrypted_backup(tmp_path / "enc2", files, password="correct")
    with pytest.raises(BackupError):
        open_backup(root, password="WRONG")


def test_encrypted_missing_password(tmp_path):
    files = {(DOMAIN_SMS, "Library/SMS/sms.db"): b"data"}
    root = build_encrypted_backup(tmp_path / "enc3", files, password="pw")
    with pytest.raises(BackupError):
        open_backup(root, password=None)
