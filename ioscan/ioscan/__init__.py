"""ioscan - offline DFIR scanner for iOS backups and sysdiagnose archives.

Defensive / digital-forensics tooling only. All analysis is read-only and
runs off-device against authorized artifacts. Modeled on Amnesty
International's MVT (Mobile Verification Toolkit).
"""

__version__ = "0.1.0"

CONSENT_NOTICE = (
    "ioscan performs read-only forensic analysis. Only scan devices/backups you "
    "are authorized to examine. This tool never runs on-device and never modifies "
    "the source artifacts."
)
