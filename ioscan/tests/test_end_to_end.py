"""Phase 6: end-to-end CLI + reporting tests."""

from __future__ import annotations

import json
from pathlib import Path

import factories as f
from click.testing import CliRunner

from ioscan.cli import cli

SAMPLE_IOCS = Path(__file__).resolve().parent.parent / "ioscan" / "data" / "sample_iocs.stix2"


def _compromised_backup(root):
    datausage = f.build_datausage_db(
        [
            {
                "name": "BackupAgentX",
                "first_unix": 1_700_000_000,
                "wwan_in": 5000,
                "wwan_out": 9000,
            },
            {"name": "assistantd", "first_unix": 1_700_000_050, "wwan_in": 10, "wwan_out": 10},
        ]
    )
    history = f.build_safari_history_db(
        [
            {"url": "https://evil-c2.example/payload", "visit_unix": 1_700_000_200},
            {"url": "https://www.apple.com/", "visit_unix": 1_700_000_300},
        ]
    )
    sms = f.build_sms_db(
        [
            {
                "text": "tap https://evil-c2.example/payload now",
                "handle": "+15550001111",
                "date_unix": 1_700_000_400,
            }
        ]
    )
    files = {
        (f.DOMAIN_DATAUSAGE, "Library/Databases/DataUsage.sqlite"): datausage,
        (f.DOMAIN_SAFARI, "Library/Safari/History.db"): history,
        (f.DOMAIN_SMS, "Library/SMS/sms.db"): sms,
    }
    return f.build_unencrypted_backup(root, files)


def _clean_backup(root):
    datausage = f.build_datausage_db(
        [{"name": "assistantd", "first_unix": 1_700_000_000, "wwan_in": 10, "wwan_out": 10}]
    )
    history = f.build_safari_history_db(
        [{"url": "https://www.apple.com/", "visit_unix": 1_700_000_200}]
    )
    files = {
        (f.DOMAIN_DATAUSAGE, "Library/Databases/DataUsage.sqlite"): datausage,
        (f.DOMAIN_SAFARI, "Library/Safari/History.db"): history,
    }
    return f.build_unencrypted_backup(root, files)


def test_e2e_compromised_backup(tmp_path):
    backup = _compromised_backup(tmp_path / "bk")
    out = tmp_path / "out"
    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["scan-backup", str(backup), "--iocs", str(SAMPLE_IOCS), "--output", str(out)],
    )
    assert result.exit_code == 2, result.output

    for fname in ("detections.json", "report.html", "report.md", "timeline.csv"):
        assert (out / fname).exists(), f"missing {fname}"

    data = json.loads((out / "detections.json").read_text())
    assert data["verdict"] == "Compromise indicators found"
    high = [d for d in data["detections"] if d["severity"] == "HIGH"]
    matched = {d["matched_value"] for d in high}
    assert "BackupAgentX" in matched
    assert any("evil-c2.example" in m for m in matched)
    # HTML report carries the verdict banner.
    assert "Compromise indicators found" in (out / "report.html").read_text()
    # Timeline CSV has a header + at least one row.
    assert (out / "timeline.csv").read_text().splitlines()[0].startswith("timestamp")


def test_e2e_clean_backup(tmp_path):
    backup = _clean_backup(tmp_path / "bk")
    out = tmp_path / "out"
    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["scan-backup", str(backup), "--iocs", str(SAMPLE_IOCS), "--output", str(out)],
    )
    assert result.exit_code == 0, result.output
    data = json.loads((out / "detections.json").read_text())
    assert data["verdict"] == "Clean"
    sev = {d["severity"] for d in data["detections"]}
    assert "HIGH" not in sev and "MEDIUM" not in sev
    assert data["detection_count"] == 0


def test_check_iocs_command():
    runner = CliRunner()
    result = runner.invoke(cli, ["check-iocs", str(SAMPLE_IOCS)])
    assert result.exit_code == 0, result.output
    assert "indicators" in result.output
