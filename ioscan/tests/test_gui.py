"""Headless tests for the GUI's non-UI logic (discovery + scan runner).

The Tk window itself is not exercised (no display in CI); these cover the
functions the window delegates to.
"""

from __future__ import annotations

from pathlib import Path

import factories as f

from ioscan import gui
from ioscan.models import Severity


def _compromised_backup(root: Path) -> Path:
    datausage = f.build_datausage_db(
        [{"name": "BackupAgentX", "first_unix": 1_700_000_000, "wwan_in": 5000, "wwan_out": 9000}]
    )
    history = f.build_safari_history_db(
        [{"url": "https://evil-c2.example/payload", "visit_unix": 1_700_000_200}]
    )
    files = {
        (f.DOMAIN_DATAUSAGE, "Library/Databases/DataUsage.sqlite"): datausage,
        (f.DOMAIN_SAFARI, "Library/Safari/History.db"): history,
    }
    return f.build_unencrypted_backup(root, files)


def test_find_backups_discovers_backup_under_root(tmp_path):
    # A UDID-style subfolder that is a real backup.
    udid = tmp_path / "00008030-ABCDEF"
    _compromised_backup(udid)

    found = gui.find_backups([tmp_path])

    assert len(found) == 1
    assert found[0].path == udid
    assert found[0].encrypted is False
    assert found[0].label  # renders without error


def test_find_backups_ignores_non_backup_dirs(tmp_path):
    (tmp_path / "random").mkdir()
    (tmp_path / "random" / "notes.txt").write_text("hello")
    assert gui.find_backups([tmp_path]) == []


def test_find_backups_survives_unreadable_root(tmp_path):
    # A path whose iterdir() raises OSError (here: a file, not a directory —
    # same graceful-skip path as macOS PermissionError / Full Disk Access).
    not_a_dir = tmp_path / "not-a-dir"
    not_a_dir.write_text("x")
    assert gui.find_backups([not_a_dir]) == []


def test_resolve_ioc_paths_falls_back_to_bundled_sample(tmp_path, monkeypatch):
    # From an empty CWD with no iocs/ folder, we get the bundled sample.
    monkeypatch.chdir(tmp_path)
    paths, real = gui.resolve_ioc_paths()
    assert real is False
    assert len(paths) == 1
    assert paths[0].name == "sample_iocs.stix2"
    assert paths[0].exists()


def test_run_scan_end_to_end(tmp_path):
    backup = _compromised_backup(tmp_path / "backup")
    ioc_paths, _ = gui.resolve_ioc_paths()
    out = tmp_path / "out"
    messages: list[str] = []

    result, reports = gui.run_scan(
        backup, ioc_paths, password=None, output_dir=out, progress=messages.append
    )

    # HIGH detections present and a compromise verdict.
    assert result.highest_severity == Severity.HIGH
    assert result.verdict == "Compromise indicators found"
    # All four report artifacts written.
    for key in ("json", "html", "md", "csv"):
        assert reports[key].exists()
    assert messages  # progress was reported
