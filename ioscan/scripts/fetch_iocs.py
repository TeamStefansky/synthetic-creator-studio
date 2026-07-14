#!/usr/bin/env python3
"""Fetch public STIX2 IOC feeds (Amnesty MVT indicators).

This is a SEPARATE, network-using step. It is intentionally NOT invoked by the
ioscan scan commands, which are fully offline. Run it ahead of time to populate
a local directory of *.stix2 files, then pass them with --iocs.

Usage:
    python scripts/fetch_iocs.py --dest iocs/
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

MVT_REPO = "https://github.com/mvt-project/mvt.git"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Amnesty MVT STIX2 IOC feeds.")
    parser.add_argument("--dest", default="iocs", help="Destination directory for *.stix2 files.")
    parser.add_argument("--repo", default=MVT_REPO, help="Git repo to clone indicators from.")
    args = parser.parse_args()

    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    clone_dir = dest / "_mvt_src"

    print(f"[*] Cloning {args.repo} (network access required)...")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", args.repo, str(clone_dir)],
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"[!] clone failed: {exc}", file=sys.stderr)
        return 1

    count = 0
    for stix in clone_dir.rglob("*.stix2"):
        target = dest / stix.name
        target.write_bytes(stix.read_bytes())
        count += 1
        print(f"[+] {target}")

    print(f"[*] Copied {count} STIX2 file(s) into {dest}/")
    print("[*] Pass them to a scan with: --iocs <file.stix2> (repeatable)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
