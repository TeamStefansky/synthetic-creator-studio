"""Centralized timestamp normalization.

All timestamps in ioscan are normalized to timezone-aware UTC ``datetime``
objects. iOS artifacts use a handful of different epochs; every conversion
lives here so the rest of the codebase never guesses.

Epochs handled:
    * Unix        - seconds since 1970-01-01 UTC
    * Cocoa/Mac   - seconds since 2001-01-01 UTC (Core Foundation / Apple)
    * WebKit      - microseconds since 1601-01-01 UTC (Chrome/WebKit)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from dateutil import parser as _dateparser

# Offset between the Cocoa/Mac epoch (2001-01-01) and the Unix epoch.
COCOA_EPOCH_OFFSET = 978307200  # seconds

# WebKit/Chrome epoch is 1601-01-01; value stored in microseconds.
WEBKIT_EPOCH = datetime(1601, 1, 1, tzinfo=UTC)


def _finite(value: float | int | None) -> bool:
    if value is None:
        return False
    try:
        return value == value and abs(float(value)) < 1e18  # rejects NaN/inf
    except (TypeError, ValueError):
        return False


def from_unix(value: float | int | None) -> datetime | None:
    """Convert a Unix timestamp (seconds) to UTC datetime."""
    if not _finite(value):
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def from_unix_ms(value: float | int | None) -> datetime | None:
    """Convert a Unix timestamp in milliseconds to UTC datetime."""
    if not _finite(value):
        return None
    return from_unix(float(value) / 1000.0)


def from_cocoa(value: float | int | None) -> datetime | None:
    """Convert a Cocoa/Mac absolute time (seconds since 2001) to UTC datetime."""
    if not _finite(value):
        return None
    return from_unix(float(value) + COCOA_EPOCH_OFFSET)


def from_webkit(value: float | int | None) -> datetime | None:
    """Convert a WebKit/Chrome timestamp (microseconds since 1601) to UTC datetime."""
    if not _finite(value):
        return None
    try:
        return WEBKIT_EPOCH + timedelta(microseconds=float(value))
    except (OverflowError, ValueError):
        return None


def parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 / RFC-3339 string into a UTC datetime.

    Naive datetimes are assumed to already be UTC.
    """
    if not value:
        return None
    try:
        dt = _dateparser.parse(value)
    except (ValueError, OverflowError, TypeError):
        return None
    return ensure_utc(dt)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Coerce any datetime to timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def to_iso(dt: datetime | None) -> str | None:
    """Render a datetime as an ISO-8601 UTC string, or None."""
    dt = ensure_utc(dt)
    return dt.isoformat() if dt else None
