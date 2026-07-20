"""Tests for the MVT-pipeline result parser and binary discovery.

The subprocess orchestration (decrypt / download-iocs / check-backup) needs a
real MVT install + a real backup and is exercised manually; here we cover the
classification logic that turns MVT's *_detected.json into an honest verdict —
in particular that informational carrier-profile events (matched_indicator:
null, level LOW) are NOT reported as spyware.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from ioscan import mvt_engine


def _write(dir_: Path, module: str, entries: list[dict]) -> None:
    (dir_ / f"{module}_detected.json").write_text(json.dumps(entries))


def test_benign_carrier_profile_is_not_spyware(tmp_path):
    # The exact shape MVT emitted for a routine carrier-settings profile.
    _write(
        tmp_path,
        "profile_events",
        [
            {
                "level": "LOW",
                "module": "profile_events",
                "message": 'install of profile "com.apple.Mirs_il..."',
                "matched_indicator": None,
            },
            {
                "level": "LOW",
                "module": "profile_events",
                "message": 'remove of profile "com.apple.Mirs_il..."',
                "matched_indicator": None,
            },
        ],
    )

    result = mvt_engine.parse_results(tmp_path)

    assert result.verdict == "Clean"
    assert result.indicator_matches == []
    assert len(result.informational) == 2


def test_real_indicator_match_is_flagged(tmp_path):
    _write(
        tmp_path,
        "safari_history",
        [
            {
                "level": "HIGH",
                "module": "safari_history",
                "message": "visit to known Pegasus domain",
                "matched_indicator": {"name": "Pegasus", "value": "evil-c2.example"},
            }
        ],
    )

    result = mvt_engine.parse_results(tmp_path)

    assert result.verdict == "Spyware indicators matched"
    assert len(result.indicator_matches) == 1


def test_notable_without_indicator_is_review(tmp_path):
    _write(
        tmp_path,
        "crashes",
        [
            {
                "level": "HIGH",
                "module": "crashes",
                "message": "crash in mediaserverd",
                "matched_indicator": None,
            }
        ],
    )

    result = mvt_engine.parse_results(tmp_path)

    assert result.verdict == "Notable events — review"
    assert result.notable and not result.indicator_matches


def test_empty_results_dir_is_clean(tmp_path):
    result = mvt_engine.parse_results(tmp_path / "does-not-exist")
    assert result.verdict == "Clean"
    assert result.findings == []


def test_find_mvt_ios_locates_current_venv(tmp_path, monkeypatch):
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    (fake_bin / "mvt-ios").write_text("#!/bin/sh\n")
    monkeypatch.setattr(sys, "executable", str(fake_bin / "python"))
    assert mvt_engine.find_mvt_ios() == str(fake_bin / "mvt-ios")
