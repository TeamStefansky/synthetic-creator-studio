"""Offline geo resolution against a bundled GeoNames cities extract.

The resolver reads a compact TSV (``name<TAB>country_code<TAB>admin1<TAB>lat<TAB>
lon<TAB>population``) produced by ``scripts/download_geonames.py`` from the
GeoNames ``cities500`` dataset. A small extract is bundled under ``data/`` so
geo resolution is fully testable offline; production points ``GEONAMES_PATH`` at
the full download.

Place names resolve to ``{country_code, admin1, lat, lon, confidence}``. When a
name is ambiguous the most-populous city wins.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from newsradar.config import get_settings
from newsradar.logging import get_logger

log = get_logger(__name__)

# Bundled extract: <repo>/data/geonames_cities500.tsv
_DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "geonames_cities500.tsv"


class GeoNamesResolver:
    """Resolve place names to coordinates using a bundled GeoNames extract."""

    def __init__(self, path: str | Path | None = None) -> None:
        settings = get_settings()
        resolved = path or settings.geonames_path or _DEFAULT_PATH
        self._path = Path(resolved)
        # name (lower) -> best entry, keyed by highest population.
        self._by_name: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            log.warning("geonames.missing", path=str(self._path))
            return
        with self._path.open(encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh, delimiter="\t")
            for row in reader:
                if len(row) < 6 or row[0].startswith("#"):
                    continue
                name, cc, admin1, lat, lon, pop = row[:6]
                try:
                    entry = {
                        "name": name,
                        "country_code": cc or None,
                        "admin1": admin1 or None,
                        "lat": float(lat),
                        "lon": float(lon),
                        "population": int(pop or 0),
                    }
                except ValueError:
                    continue
                key = name.strip().lower()
                prev = self._by_name.get(key)
                if prev is None or entry["population"] > prev["population"]:
                    self._by_name[key] = entry

    def __len__(self) -> int:
        return len(self._by_name)

    def resolve(self, name: str | None) -> dict[str, Any] | None:
        """Resolve ``name`` to ``{country_code, admin1, lat, lon, confidence}`` or ``None``."""

        if not name:
            return None
        entry = self._by_name.get(name.strip().lower())
        if entry is None:
            return None
        return {
            "country_code": entry["country_code"],
            "admin1": entry["admin1"],
            "lat": entry["lat"],
            "lon": entry["lon"],
            "confidence": 1.0,
        }
