# CLAUDE.md - ioscan

Persistent project memory for AI assistants working in this repo.

## What this is

`ioscan` is a **defensive DFIR CLI**. It scans iOS backups and unpacked
sysdiagnose archives **offline, read-only** for spyware/stalkerware IOCs.
Modeled on Amnesty International's MVT. It NEVER runs on-device, NEVER makes
network calls during a scan, and NEVER mutates source artifacts.

## Hard rules

- **Defensive only.** No offensive capability, no on-device execution, no
  exfiltration. Read-only forensic analysis of authorized artifacts.
- **No network in scan commands.** `scan-backup` / `scan-sysdiagnose` are fully
  offline. IOC-feed fetching is a separate step (`scripts/fetch_iocs.py`).
- **Never hardcode IOCs in Python.** Load them from STIX2 files. A synthetic
  sample lives at `ioscan/data/sample_iocs.stix2`.
- **Extractor isolation.** One failing artifact must never abort a scan; the
  failure is recorded as an INFO note and the scan continues.
- **Timestamps** are always timezone-aware UTC. All epoch conversions
  (Unix / Cocoa-2001 / WebKit-1601) live in `ioscan/timeutil.py` only.
- **Don't invent Apple schemas from memory.** Where a path/schema is
  unverified, implement a reasonable parser and add a
  `# TODO(verify-schema): ...` comment. Fixtures are synthetic and built
  programmatically in `tests/factories.py`.
- **Do not run git.** Another process owns commits.

## Stack

- Python 3.11+, packaged with `pyproject.toml` (PEP 621). Entry point `ioscan`.
- CLI: `click`. Deps: `stix2`, `pycryptodome`, `rich`, `jinja2`,
  `python-dateutil`, plus stdlib `sqlite3` / `plistlib`.
- Lint/format: `ruff`. Tests: `pytest`.
- Virtualenv at `.venv/` (never touch system Python).

## Commands

```bash
source .venv/bin/activate
pip install -e '.[dev]'      # install
pytest                       # run tests (must be green)
ruff check .                 # lint (must be green)
ruff format --check .        # format check (must be green)

ioscan scan-backup <dir> --iocs <f.stix2> [--password PW] --output out/
ioscan scan-sysdiagnose <dir> --iocs <f.stix2> --output out/
ioscan check-iocs <f.stix2>
ioscan version
```

Every phase of work must end with `pytest`, `ruff check .`, and
`ruff format --check .` all GREEN. Never declare done on "looks right" - run
the tools.

## Layout

```
ioscan/
  cli.py            # click CLI: scan-backup, scan-sysdiagnose, check-iocs, version
  scanner.py        # orchestration; extractor isolation; runs IOC + heuristic engines
  models.py         # Record, Detection, ScanResult, Severity, ScanNote
  timeutil.py       # ALL epoch/timezone conversions
  console.py        # rich console + logging
  backup/           # Manifest.db + Manifest.plist; encrypted keybag parse/unwrap/decrypt
    keybag.py         # keybag TLV parse, PBKDF2 derivation, RFC 3394 AES key wrap/unwrap
    manifest.py       # Files table -> fileID -> <backup>/<first2>/<fileID>
    backup.py         # Backup facade; lazy streaming decryption
  artifacts/        # one Extractor per artifact, registered via @register_extractor
    base.py           # Extractor protocol, ExtractionContext, registry, sqlite helpers
    datausage.py safari.py sms.py crashlogs.py profiles.py tcc.py apps.py
    analytics.py sysdiagnose.py
  iocs/             # STIX2 loader + per-type matchers + engine
  heuristics/       # anomaly rules, registered via @register_heuristic
  report/           # json/html/md/csv renderers + verdict banner (jinja2 templates)
  data/             # bundled sample_iocs.stix2
scripts/fetch_iocs.py  # SEPARATE network step to fetch Amnesty MVT feeds
tests/                 # pytest suite + tests/factories.py (synthetic fixture builders)
```

## Adding things (extension points)

- **New artifact extractor**: add one file in `ioscan/artifacts/`, implement the
  `Extractor` protocol (`name`, `scan_types`, `extract(ctx)`), decorate with
  `@register_extractor`, and import it in `ioscan/artifacts/__init__.py`. No core
  edits.
- **New heuristic**: implement `Heuristic` (`name`, `scan_types`,
  `evaluate(records)`) in `ioscan/heuristics/rules.py`, decorate with
  `@register_heuristic`.
- **New IOC type / matcher**: extend `ioscan/iocs/loader.py` (STIX mapping) and
  `ioscan/iocs/matchers.py`.

## Verdict logic

Highest detection severity drives the verdict: `HIGH` -> "Compromise indicators
found", `MEDIUM`/`LOW` -> "Suspicious", none/INFO -> "Clean". Detections are
severity-sorted in all reports.
