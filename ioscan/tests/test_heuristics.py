"""Phase 4: heuristics + remaining extractor tests."""

from __future__ import annotations

import factories as f

from ioscan.artifacts import ExtractionContext, iter_extractors
from ioscan.backup import open_backup
from ioscan.heuristics import run_heuristics
from ioscan.models import Record, Severity


def _run_extractor(backup_root, work_dir, name):
    with open_backup(backup_root) as bk:
        ctx = ExtractionContext(work_dir=work_dir, backup=bk)
        for ext in iter_extractors("backup"):
            if ext.name == name:
                return list(ext.extract(ctx))
    return []


def _heur(records, scan_type="backup"):
    return list(run_heuristics(records, scan_type))


def rec(rtype, **raw):
    return Record(type=rtype, raw=raw, source_file="test", timestamp=None)


# -- heuristics fire on anomalies -----------------------------------------
def test_suspicious_random_process_fires():
    dets = _heur([rec("network_usage", process="x8f2kd9qzp")])
    assert any(d.rule == "suspicious_process_name" for d in dets)


def test_apple_impersonation_fires():
    dets = _heur([rec("network_usage", process="Apple-Backup-Helper")])
    assert any(d.rule == "suspicious_process_name" for d in dets)


def test_high_risk_crash_fires():
    dets = _heur([rec("crash_report", process="mediaserverd")])
    assert any(d.rule == "high_risk_crash" and d.severity == Severity.MEDIUM for d in dets)


def test_mdm_profile_fires_high():
    dets = _heur([rec("config_profile", identifier="com.evil.mdm", has_mdm=True)])
    hit = [d for d in dets if d.rule == "unexpected_config_profile"]
    assert hit and hit[0].severity == Severity.HIGH


def test_jailbreak_trace_fires():
    dets = _heur(
        [rec("installed_app", bundle_id="com.saurik.Cydia", path="/Applications/Cydia.app")]
    )
    assert any(d.rule == "jailbreak_trace" and d.severity == Severity.HIGH for d in dets)


# -- heuristics silent on clean data --------------------------------------
def test_clean_process_names_silent():
    clean = [
        rec("network_usage", process="assistantd"),
        rec("network_usage", process="com.apple.WebKit.Networking"),
        rec("network_usage", process="mediaserverd"),
        rec("crash_report", process="SpringBoard"),
        rec("installed_app", bundle_id="com.apple.mobilesafari", path="/Applications/Safari.app"),
    ]
    assert _heur(clean) == []


# -- remaining extractors --------------------------------------------------
def test_tcc_extractor(tmp_path):
    db = f.build_tcc_db(
        [{"service": "kTCCServiceMicrophone", "client": "com.evil.spy", "allowed": 2}]
    )
    root = f.build_unencrypted_backup(tmp_path / "bk", {("HomeDomain", "Library/TCC/TCC.db"): db})
    recs = _run_extractor(root, tmp_path / "work", "tcc")
    assert any(r.raw["client"] == "com.evil.spy" for r in recs)


def test_knowledgec_extractor(tmp_path):
    db = f.build_knowledgec_db([{"bundle": "com.evil.spy", "start_unix": 1_700_000_000}])
    rel = "Library/CoreDuet/Knowledge/knowledgeC.db"
    domain = "AppDomainGroup-group.com.apple.coreduet.appmonitor"
    root = f.build_unencrypted_backup(tmp_path / "bk", {(domain, rel): db})
    recs = _run_extractor(root, tmp_path / "work", "knowledgec")
    assert any(r.raw["process"] == "com.evil.spy" for r in recs)
    assert all(r.type == "process_launch" for r in recs)


def test_config_profile_extractor(tmp_path):
    pl = f.build_profiles_plist([{"identifier": "com.example.mdm", "has_mdm": True}])
    domain = "SysSharedContainerDomain-systemgroup.com.apple.configurationprofiles"
    rel = "Library/ConfigurationProfiles/ProfileList.plist"
    root = f.build_unencrypted_backup(tmp_path / "bk", {(domain, rel): pl})
    recs = _run_extractor(root, tmp_path / "work", "config_profiles")
    assert recs and recs[0].raw["has_mdm"] is True


def test_installed_apps_extractor(tmp_path):
    pl = f.build_apps_plist(
        {"com.saurik.Cydia": {"Path": "/Applications/Cydia.app", "name": "Cydia"}}
    )
    root = f.build_unencrypted_backup(
        tmp_path / "bk", {("RootDomain", "Library/ioscan/Applications.plist"): pl}
    )
    recs = _run_extractor(root, tmp_path / "work", "installed_apps")
    assert any(r.raw["bundle_id"] == "com.saurik.Cydia" for r in recs)
