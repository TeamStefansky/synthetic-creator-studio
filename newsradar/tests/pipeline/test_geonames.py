"""Offline geo resolution against the bundled GeoNames extract."""

from __future__ import annotations

from newsradar.pipeline.geonames import GeoNamesResolver


def test_resolves_known_city() -> None:
    resolver = GeoNamesResolver()
    assert len(resolver) > 0
    geneva = resolver.resolve("Geneva")
    assert geneva is not None
    assert geneva["country_code"] == "CH"
    assert abs(geneva["lat"] - 46.20) < 0.1
    assert geneva["confidence"] == 1.0


def test_case_insensitive_and_unknown() -> None:
    resolver = GeoNamesResolver()
    assert resolver.resolve("jerusalem") is not None
    assert resolver.resolve("Atlantis") is None
    assert resolver.resolve(None) is None
