"""Normalisation helpers: canonical URLs, hashing, language, text extraction, time.

None of these functions touch the database. :func:`normalize_document` ties them
together and honours the ``allows_fulltext_storage`` licensing gate.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import py3langid as langid
import trafilatura
from pydantic import BaseModel

from newsradar.connectors.base import RawDocument

SUMMARY_MAX_CHARS = 400

# Query-string parameters that never identify content — stripped from canonical URLs.
_TRACKING_PARAMS = frozenset(
    {
        "gclid",
        "fbclid",
        "dclid",
        "msclkid",
        "yclid",
        "igshid",
        "mc_cid",
        "mc_eid",
        "ref",
        "ref_src",
        "ref_url",
        "cmpid",
        "campaign",
        "spm",
        "vero_id",
        "vero_conv",
        "_hsenc",
        "_hsmi",
        "mkt_tok",
        "s_kwcid",
        "wt_mc",
        "at_medium",
        "at_campaign",
        "guccounter",
    }
)

_TRACKING_PREFIXES = ("utm_", "pk_", "piwik_", "matomo_", "hsa_")

_WS_RE = re.compile(r"\s+")


def _is_tracking_param(key: str) -> bool:
    lowered = key.lower()
    if lowered in _TRACKING_PARAMS:
        return True
    return lowered.startswith(_TRACKING_PREFIXES)


def canonical_url(url: str) -> str:
    """Return a canonicalised URL.

    Lowercases scheme and host, drops the fragment, strips tracking query
    parameters, and resolves ``amp``/``m.`` host and ``/amp`` path variants.
    """

    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower() or "https"

    host = parts.hostname or ""
    host = host.lower()
    # Resolve mobile / AMP host variants: m.example.com, amp.example.com.
    for prefix in ("amp.", "m.", "mobile."):
        if host.startswith(prefix) and host.count(".") >= 2:
            host = host[len(prefix) :]
            break

    netloc = host
    if parts.port:
        default = (scheme == "http" and parts.port == 80) or (
            scheme == "https" and parts.port == 443
        )
        if not default:
            netloc = f"{host}:{parts.port}"

    path = parts.path
    # Resolve /amp path variants: strip a trailing /amp or /amp/ segment.
    path = re.sub(r"/amp/?$", "/", path)
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")

    pairs = parse_qsl(parts.query, keep_blank_values=True)
    kept = [(k, v) for k, v in pairs if not _is_tracking_param(k)]
    kept.sort()
    query = urlencode(kept)

    return urlunsplit((scheme, netloc, path, query, ""))


def url_hash(canonical: str) -> str:
    """Return the SHA-256 hex digest of a canonical URL (64 chars)."""

    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def detect_language(text: str | None) -> str | None:
    """Detect an ISO-639-1 language code, or ``None`` for empty input."""

    if not text:
        return None
    stripped = text.strip()
    if not stripped:
        return None
    code, _confidence = langid.classify(stripped)
    return str(code)


def html_to_text(html: str | None) -> str | None:
    """Extract the main article text from HTML with trafilatura; ``None`` on failure."""

    if not html:
        return None
    extracted = trafilatura.extract(html, include_comments=False, include_tables=False)
    if extracted:
        return str(extracted).strip()
    return None


def normalize_published_at(value: dt.datetime | None) -> dt.datetime | None:
    """Return a timezone-aware UTC datetime (naive input is assumed UTC)."""

    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.UTC)
    return value.astimezone(dt.UTC)


def build_summary(title: str | None, text: str | None) -> str | None:
    """Build a ``<=SUMMARY_MAX_CHARS`` summary from the body text (or title)."""

    source = text or title
    if not source:
        return None
    collapsed = _WS_RE.sub(" ", source).strip()
    if not collapsed:
        return None
    if len(collapsed) <= SUMMARY_MAX_CHARS:
        return collapsed
    return collapsed[: SUMMARY_MAX_CHARS - 1].rstrip() + "…"


class NormalizedDocument(BaseModel):
    """A raw document after normalisation, ready for matching and persistence."""

    source_domain: str
    external_id: str | None
    url: str
    canonical_url: str
    url_hash: str
    title: str | None
    body: str | None
    summary: str | None
    lang: str | None
    published_at: dt.datetime | None
    author: str | None
    media_type: str
    engagement: dict[str, Any] | None
    raw: dict[str, Any]

    def match_text(self) -> str:
        """Text used for watchlist matching (title + body/summary)."""

        return "\n".join(p for p in (self.title, self.body or self.summary) if p)

    def dedup_text(self) -> str:
        """Text used for SimHash: title + first 500 chars of the body/summary."""

        title = self.title or ""
        body = self.body or self.summary or ""
        return f"{title}\n{body[:500]}"


def normalize_document(raw: RawDocument, *, allows_fulltext_storage: bool) -> NormalizedDocument:
    """Normalise a :class:`RawDocument`.

    Full body text is stored only when ``allows_fulltext_storage`` is true;
    otherwise ``body`` is left ``None`` and a short extract lives in ``summary``.
    """

    canonical = canonical_url(raw.url)

    # Prefer already-extracted text; otherwise extract from HTML.
    body_text = raw.body_text or html_to_text(raw.body_html)

    lang = raw.lang or detect_language(raw.title or body_text)

    summary = raw.summary or build_summary(raw.title, body_text)
    body = body_text if allows_fulltext_storage else None

    return NormalizedDocument(
        source_domain=raw.source_domain.lower(),
        external_id=raw.external_id,
        url=raw.url,
        canonical_url=canonical,
        url_hash=url_hash(canonical),
        title=raw.title,
        body=body,
        summary=summary,
        lang=lang,
        published_at=normalize_published_at(raw.published_at),
        author=raw.author,
        media_type=str(raw.media_type),
        engagement=raw.engagement,
        raw=raw.raw,
    )
