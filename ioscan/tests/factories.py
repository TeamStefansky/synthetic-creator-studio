"""Programmatic builders for synthetic iOS forensic artifacts used in tests.

There are no real device backups available, so every fixture here is
constructed from scratch. The encrypted-backup builder mirrors the real
key hierarchy (keybag TLV + RFC 3394 wrap + AES-CBC) so it exercises the
production decryption path.
"""

from __future__ import annotations

import hashlib
import json
import os
import plistlib
import sqlite3
import struct
import tempfile
from pathlib import Path

from Crypto.Cipher import AES

from ioscan.backup.keybag import WRAP_PASSCODE, aes_wrap_key
from ioscan.timeutil import COCOA_EPOCH_OFFSET

# Common iOS backup domains used throughout the fixtures.
DOMAIN_DATAUSAGE = "WirelessDomain"
DOMAIN_SAFARI = "AppDomain-com.apple.mobilesafari"
DOMAIN_SMS = "HomeDomain"
DOMAIN_ROOT = "RootDomain"


def file_id(domain: str, relative_path: str) -> str:
    """SHA-1 of ``domain-relativePath`` -> the 40-hex on-disk fileID."""
    return hashlib.sha1(f"{domain}-{relative_path}".encode()).hexdigest()


def _to_cocoa(unix_ts: float) -> float:
    return unix_ts - COCOA_EPOCH_OFFSET


def _sqlite_bytes(build) -> bytes:
    """Run ``build(conn)`` on a fresh SQLite DB and return its file bytes."""
    fd, name = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        conn = sqlite3.connect(name)
        build(conn)
        conn.commit()
        conn.close()
        return Path(name).read_bytes()
    finally:
        Path(name).unlink(missing_ok=True)


def build_datausage_db(processes: list[dict]) -> bytes:
    """processes: [{name, bundle, first_unix, wwan_in, wwan_out, ts_unix}]."""

    def build(conn):
        conn.execute(
            "CREATE TABLE ZPROCESS (Z_PK INTEGER PRIMARY KEY, ZPROCNAME TEXT, "
            "ZBUNDLENAME TEXT, ZFIRSTTIMESTAMP REAL, ZTIMESTAMP REAL)"
        )
        conn.execute(
            "CREATE TABLE ZLIVEUSAGE (Z_PK INTEGER PRIMARY KEY, ZHASPROCESS INTEGER, "
            "ZWWANIN REAL, ZWWANOUT REAL, ZTIMESTAMP REAL)"
        )
        for i, p in enumerate(processes, start=1):
            conn.execute(
                "INSERT INTO ZPROCESS VALUES (?, ?, ?, ?, ?)",
                (i, p["name"], p.get("bundle"), _to_cocoa(p.get("first_unix", 0)), None),
            )
            conn.execute(
                "INSERT INTO ZLIVEUSAGE VALUES (?, ?, ?, ?, ?)",
                (
                    i,
                    i,
                    p.get("wwan_in", 0),
                    p.get("wwan_out", 0),
                    _to_cocoa(p.get("ts_unix", p.get("first_unix", 0))),
                ),
            )

    return _sqlite_bytes(build)


def build_safari_history_db(visits: list[dict]) -> bytes:
    """visits: [{url, title, visit_count, visit_unix}]."""

    def build(conn):
        conn.execute(
            "CREATE TABLE history_items (id INTEGER PRIMARY KEY, url TEXT, "
            "domain_expansion TEXT, visit_count INTEGER)"
        )
        conn.execute(
            "CREATE TABLE history_visits (id INTEGER PRIMARY KEY, history_item INTEGER, "
            "visit_time REAL, title TEXT, load_successful INTEGER)"
        )
        for i, v in enumerate(visits, start=1):
            conn.execute(
                "INSERT INTO history_items VALUES (?, ?, ?, ?)",
                (i, v["url"], None, v.get("visit_count", 1)),
            )
            conn.execute(
                "INSERT INTO history_visits VALUES (?, ?, ?, ?, ?)",
                (i, i, _to_cocoa(v.get("visit_unix", 0)), v.get("title"), 1),
            )

    return _sqlite_bytes(build)


def build_rls_db(domains: list[str]) -> bytes:
    def build(conn):
        conn.execute(
            "CREATE TABLE ObservedDomains (domainID INTEGER PRIMARY KEY, registrableDomain TEXT)"
        )
        for i, d in enumerate(domains, start=1):
            conn.execute("INSERT INTO ObservedDomains VALUES (?, ?)", (i, d))

    return _sqlite_bytes(build)


def build_sms_db(messages: list[dict]) -> bytes:
    """messages: [{text, handle, service, is_from_me, date_unix, nanoseconds}]."""

    def build(conn):
        conn.execute("CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, service TEXT)")
        conn.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, date INTEGER, "
            "handle_id INTEGER, is_from_me INTEGER, service TEXT)"
        )
        handles: dict[str, int] = {}
        for i, m in enumerate(messages, start=1):
            handle = m.get("handle")
            hid = None
            if handle is not None:
                if handle not in handles:
                    hid = len(handles) + 1
                    handles[handle] = hid
                    conn.execute(
                        "INSERT INTO handle VALUES (?, ?, ?)",
                        (hid, handle, m.get("service", "iMessage")),
                    )
                else:
                    hid = handles[handle]
            cocoa = _to_cocoa(m.get("date_unix", 0))
            date_val = int(cocoa * 1_000_000_000) if m.get("nanoseconds", True) else int(cocoa)
            conn.execute(
                "INSERT INTO message VALUES (?, ?, ?, ?, ?, ?)",
                (i, m.get("text"), date_val, hid, m.get("is_from_me", 0), m.get("service")),
            )

    return _sqlite_bytes(build)


def build_ips(header: dict, body: dict) -> bytes:
    return (json.dumps(header) + "\n" + json.dumps(body)).encode("utf-8")


def build_tcc_db(entries: list[dict]) -> bytes:
    """entries: [{service, client, allowed, last_modified_unix}]."""

    def build(conn):
        conn.execute(
            "CREATE TABLE access (service TEXT, client TEXT, client_type INTEGER, "
            "auth_value INTEGER, last_modified INTEGER)"
        )
        for e in entries:
            conn.execute(
                "INSERT INTO access VALUES (?, ?, ?, ?, ?)",
                (
                    e["service"],
                    e["client"],
                    0,
                    e.get("allowed", 2),
                    e.get("last_modified_unix", 1_700_000_000),
                ),
            )

    return _sqlite_bytes(build)


def build_knowledgec_db(events: list[dict]) -> bytes:
    """events: [{bundle, stream, start_unix}]."""

    def build(conn):
        conn.execute(
            "CREATE TABLE ZOBJECT (Z_PK INTEGER PRIMARY KEY, ZSTREAMNAME TEXT, "
            "ZVALUESTRING TEXT, ZSTARTDATE REAL)"
        )
        for i, e in enumerate(events, start=1):
            conn.execute(
                "INSERT INTO ZOBJECT VALUES (?, ?, ?, ?)",
                (
                    i,
                    e.get("stream", "/app/inFocus"),
                    e["bundle"],
                    _to_cocoa(e.get("start_unix", 0)),
                ),
            )

    return _sqlite_bytes(build)


def build_profiles_plist(profiles: list[dict]) -> bytes:
    """profiles: [{identifier, display_name, has_mdm}]."""
    out = []
    for p in profiles:
        entry = {
            "PayloadIdentifier": p["identifier"],
            "PayloadDisplayName": p.get("display_name", p["identifier"]),
            "PayloadOrganization": p.get("organization", ""),
        }
        if p.get("has_mdm"):
            entry["PayloadContent"] = [{"PayloadType": "com.apple.mdm"}]
        out.append(entry)
    return plistlib.dumps(out)


def build_apps_plist(apps: dict[str, dict]) -> bytes:
    return plistlib.dumps({"Applications": apps})


def build_sysdiagnose(
    root: Path,
    shutdown_log: str | None = None,
    ps_txt: str | None = None,
    ips_files: dict[str, bytes] | None = None,
) -> Path:
    """Create an unpacked sysdiagnose directory tree."""
    root.mkdir(parents=True, exist_ok=True)
    if shutdown_log is not None:
        (root / "system_logs.logarchive").mkdir(exist_ok=True)
        (root / "shutdown.log").write_text(shutdown_log)
    if ps_txt is not None:
        (root / "ps.txt").write_text(ps_txt)
    if ips_files:
        crash_dir = root / "crashes_and_spins"
        crash_dir.mkdir(exist_ok=True)
        for name, content in ips_files.items():
            (crash_dir / name).write_bytes(content)
    return root


def shutdown_log_sticky(process_path: str, repeats: int = 3) -> str:
    """Build a shutdown.log where one client repeatedly delays unmount."""
    lines = []
    for i in range(repeats):
        lines.append(f"2023-01-0{i + 1} 00:00:00.000000+0000 SIGTERM sent to all processes")
        lines.append("After 30 seconds shutdown is not finished, ")
        lines.append(f"remaining client pid: 861 ({process_path})")
        lines.append("")
    return "\n".join(lines)


def shutdown_log_clean() -> str:
    return (
        "2023-01-01 00:00:00.000000+0000 SIGTERM sent to all processes\n"
        "remaining client pid: 101 (/usr/libexec/one)\n"
        "2023-01-02 00:00:00.000000+0000 SIGTERM sent to all processes\n"
        "remaining client pid: 102 (/usr/libexec/two)\n"
    )


def _mbfile_plain(size: int) -> bytes:
    return plistlib.dumps({"Size": size, "Flags": 1})


def _mbfile_encrypted(size: int, protection_class: int, wrapped_key: bytes) -> bytes:
    return plistlib.dumps(
        {
            "Size": size,
            "Flags": 1,
            "ProtectionClass": protection_class,
            "EncryptionKey": wrapped_key,
        }
    )


def build_unencrypted_backup(root: Path, files: dict[tuple[str, str], bytes]) -> Path:
    """Create an unencrypted backup at ``root`` from a {(domain, relpath): bytes} map.

    Returns ``root``. Also writes Manifest.plist and Manifest.db.
    """
    root.mkdir(parents=True, exist_ok=True)
    (root / "Manifest.plist").write_bytes(plistlib.dumps({"IsEncrypted": False, "Version": "10.0"}))
    db_path = root / "Manifest.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, "
        "relativePath TEXT, flags INTEGER, file BLOB)"
    )
    for (domain, relpath), content in files.items():
        fid = file_id(domain, relpath)
        sub = root / fid[:2]
        sub.mkdir(exist_ok=True)
        (sub / fid).write_bytes(content)
        conn.execute(
            "INSERT INTO Files VALUES (?, ?, ?, ?, ?)",
            (fid, domain, relpath, 1, _mbfile_plain(len(content))),
        )
    conn.commit()
    conn.close()
    return root


def _encrypt_cbc_raw(key: bytes, data: bytes) -> bytes:
    """AES-CBC encrypt, zero IV, PKCS7 padding."""
    pad = 16 - (len(data) % 16) or 16
    data = data + bytes([pad]) * pad
    return AES.new(key, AES.MODE_CBC, iv=b"\x00" * 16).encrypt(data)


def _encrypt_cbc_nopad(key: bytes, data: bytes) -> bytes:
    """AES-CBC encrypt with no padding (data must be block aligned)."""
    if len(data) % 16:
        data = data + b"\x00" * (16 - len(data) % 16)
    return AES.new(key, AES.MODE_CBC, iv=b"\x00" * 16).encrypt(data)


def _build_keybag(
    passcode_key: bytes,
    salt: bytes,
    iters: int,
    dpsl: bytes,
    dpic: int,
    class_key: bytes,
    protection_class: int,
) -> bytes:
    """Assemble a minimal but valid backup keybag TLV blob."""

    def tlv(tag: str, value: bytes) -> bytes:
        return tag.encode("ascii") + struct.pack(">I", len(value)) + value

    wpky = aes_wrap_key(passcode_key, class_key)
    blob = b"".join(
        [
            tlv("VERS", struct.pack(">I", 4)),
            tlv("TYPE", struct.pack(">I", 1)),
            tlv("UUID", os.urandom(16)),
            tlv("HMCK", os.urandom(40)),
            tlv("WRAP", struct.pack(">I", 0)),
            tlv("SALT", salt),
            tlv("ITER", struct.pack(">I", iters)),
            tlv("DPSL", dpsl),
            tlv("DPIC", struct.pack(">I", dpic)),
            # class key block
            tlv("UUID", os.urandom(16)),
            tlv("CLAS", struct.pack(">I", protection_class)),
            tlv("WRAP", struct.pack(">I", WRAP_PASSCODE)),
            tlv("KTYP", struct.pack(">I", 0)),
            tlv("WPKY", wpky),
        ]
    )
    return blob


def build_encrypted_backup(
    root: Path,
    files: dict[tuple[str, str], bytes],
    password: str,
    protection_class: int = 3,
) -> Path:
    """Create an encrypted backup exercising the full key hierarchy."""
    root.mkdir(parents=True, exist_ok=True)
    salt = os.urandom(20)
    dpsl = os.urandom(20)
    iters = 1000
    dpic = 1000
    stage1 = hashlib.pbkdf2_hmac("sha256", password.encode(), dpsl, dpic, 32)
    passcode_key = hashlib.pbkdf2_hmac("sha1", stage1, salt, iters, 32)

    class_key = os.urandom(32)
    keybag_blob = _build_keybag(passcode_key, salt, iters, dpsl, dpic, class_key, protection_class)

    # Build the (plaintext) Manifest.db first.
    plain_db = root / "Manifest.plaintext.db"
    conn = sqlite3.connect(str(plain_db))
    conn.execute(
        "CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, "
        "relativePath TEXT, flags INTEGER, file BLOB)"
    )
    for (domain, relpath), content in files.items():
        fid = file_id(domain, relpath)
        file_key = os.urandom(32)
        wrapped = aes_wrap_key(class_key, file_key)
        enc = _encrypt_cbc_raw(file_key, content)
        sub = root / fid[:2]
        sub.mkdir(exist_ok=True)
        (sub / fid).write_bytes(enc)
        conn.execute(
            "INSERT INTO Files VALUES (?, ?, ?, ?, ?)",
            (fid, domain, relpath, 1, _mbfile_encrypted(len(content), protection_class, wrapped)),
        )
    conn.commit()
    conn.close()

    # Encrypt Manifest.db with a dedicated manifest key.
    manifest_file_key = os.urandom(32)
    manifest_wrapped = aes_wrap_key(class_key, manifest_file_key)
    manifest_key_blob = struct.pack("<I", protection_class) + manifest_wrapped
    db_plain_bytes = plain_db.read_bytes()
    (root / "Manifest.db").write_bytes(_encrypt_cbc_nopad(manifest_file_key, db_plain_bytes))
    plain_db.unlink()

    (root / "Manifest.plist").write_bytes(
        plistlib.dumps(
            {
                "IsEncrypted": True,
                "Version": "10.0",
                "BackupKeyBag": keybag_blob,
                "ManifestKey": manifest_key_blob,
            }
        )
    )
    return root
