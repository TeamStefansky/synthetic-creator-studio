"""Download the GeoNames ``cities500`` dataset and write the compact extract.

Usage::

    uv run python scripts/download_geonames.py [--out data/geonames_cities500.tsv]

Fetches ``https://download.geonames.org/export/dump/cities500.zip`` (a public
domain dataset, CC BY 4.0), which is a 19-column TSV, and writes the compact
6-column format read by :class:`newsradar.pipeline.geonames.GeoNamesResolver`:
``name<TAB>country_code<TAB>admin1<TAB>lat<TAB>lon<TAB>population``.

Network egress is blocked in the build sandbox, so this script is for production
use; a small hand-curated extract is bundled under ``data/`` for offline tests.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

CITIES500_URL = "https://download.geonames.org/export/dump/cities500.zip"


def _convert(raw: io.TextIOBase, out_path: Path) -> int:
    reader = csv.reader(raw, delimiter="\t")
    written = 0
    with out_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, delimiter="\t")
        writer.writerow(["# name", "country_code", "admin1", "lat", "lon", "population"])
        for row in reader:
            # GeoNames columns: 1=name, 4=lat, 5=lon, 8=country_code, 10=admin1, 14=population.
            if len(row) < 15:
                continue
            writer.writerow([row[1], row[8], row[10], row[4], row[5], row[14]])
            written += 1
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download GeoNames cities500 extract.")
    parser.add_argument("--out", default="data/geonames_cities500.tsv")
    parser.add_argument("--url", default=CITIES500_URL)
    args = parser.parse_args(argv)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"downloading {args.url} ...", file=sys.stderr)
    with urllib.request.urlopen(args.url) as resp:  # noqa: S310 - trusted GeoNames host
        blob = resp.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as zf, zf.open("cities500.txt") as member:
        text = io.TextIOWrapper(member, encoding="utf-8")
        count = _convert(text, out_path)
    print(f"wrote {count} rows to {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
