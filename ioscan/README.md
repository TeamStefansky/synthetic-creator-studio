# ioscan

**Offline DFIR scanner for iOS backups and sysdiagnose archives.**

`ioscan` is a **defensive**, read-only digital-forensics tool. It scans an iOS
backup or an unpacked sysdiagnose archive **offline** for spyware/stalkerware
indicators of compromise (IOCs) and heuristic anomalies. It is modeled on
[Amnesty International's MVT](https://github.com/mvt-project/mvt).

> ioscan never runs on-device, never makes network calls during a scan, and
> never modifies the source artifacts. Only scan devices/backups you are
> authorized to examine. Every run prints this consent notice.

## What it looks at

- **DataUsage.sqlite / netusage.sqlite** - per-process network usage
- **Safari History.db** + **WebKit ResourceLoadStatistics** - browsing / observed domains
- **sms.db** - iMessage/SMS bodies and embedded links
- **DiagnosticReports** crash logs (`.ips`) + **JetsamEvent**
- **Configuration / MDM profiles**, **TCC.db** (privacy grants)
- **Installed apps** + iTunes metadata
- **KnowledgeC.db** / **core_analytics** process-launch events
- **sysdiagnose**: `shutdown.log` sticky-process analysis (Triangulation
  technique), `ps.txt` process listings, crash directories

Matches come from two engines: a **STIX2 IOC engine** (domain / url / process /
path / bundle-id / email / sha1 / sha256) and a **heuristics engine** (random or
Apple-impersonating process names, high-risk crash signatures, unexpected
config profiles, jailbreak traces, sticky shutdown processes).

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
ioscan version
```

Requires Python 3.11+.

## Usage

### Scan an iOS backup

```bash
ioscan scan-backup /path/to/backup \
    --iocs /path/to/indicators.stix2 \
    --output out/
```

Encrypted backups need the backup password:

```bash
ioscan scan-backup /path/to/backup --password 'hunter2' \
    --iocs indicators.stix2 --output out/
```

Outputs written to `out/`:

- `detections.json` - machine-readable findings + verdict
- `report.html` - styled report with a verdict banner
- `report.md` - Markdown report
- `timeline.csv` - merged, time-sorted events across all artifacts

Exit codes: `0` clean / info-only, `1` low-severity findings, `2` medium or
high-severity findings.

### Scan a sysdiagnose archive

Unpack the sysdiagnose `.tar.gz` first, then:

```bash
ioscan scan-sysdiagnose /path/to/sysdiagnose_dir \
    --iocs indicators.stix2 --output out/
```

### Validate an IOC file

```bash
ioscan check-iocs indicators.stix2
```

## Creating an (encrypted) iOS backup

On macOS with Finder (or iTunes on Windows):

1. Connect the device over USB and trust the computer.
2. In Finder, select the device, choose **Back up all of the data on your
   iPhone to this Mac**.
3. **Enable "Encrypt local backup"** and set a password. Encrypted backups are
   strongly recommended: they include far more forensically valuable data
   (Health, keychain, call history, more logs) than unencrypted ones.
4. Click **Back Up Now**.

The backup lives at
`~/Library/Application Support/MobileSync/Backup/<UDID>/` on macOS. Point
`ioscan scan-backup` at that `<UDID>` directory. Provide the encryption
password with `--password`.

To collect a **sysdiagnose** on-device: press Volume Up + Volume Down + Side
button briefly, wait ~10 minutes, then retrieve it from
**Settings > Privacy & Security > Analytics & Improvements > Analytics Data**
(entries named `sysdiagnose_...`). Unpack the archive before scanning.

## Fetching public IOC feeds (Amnesty MVT)

Fetching IOC feeds is a **separate, documented step** and is intentionally
**not** part of the (offline) scan commands. Amnesty's public indicators live in
the MVT repository:

```bash
# Clone the MVT indicators (STIX2 files, *.stix2):
git clone https://github.com/mvt-project/mvt.git
find mvt -name '*.stix2'

# Or use the bundled convenience helper (performs network I/O):
python scripts/fetch_iocs.py --dest iocs/
```

Then pass one or more `--iocs <file.stix2>` to a scan command. A small bundled
sample lives at `ioscan/data/sample_iocs.stix2` (synthetic; for tests/demos).

## Development

```bash
pip install -e '.[dev]'
pytest
ruff check .
ruff format --check .
```

## Scope and limitations

This is triage tooling, not proof of compromise. Some Apple artifact schemas
vary across iOS versions; parsers that could not be validated against a real
device carry `# TODO(verify-schema)` comments describing what to confirm. The
bundled fixtures are synthetic (there are no real device backups in this repo).
