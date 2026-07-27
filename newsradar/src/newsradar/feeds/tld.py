"""Registrable-domain extraction via ``tldextract``.

``tldextract`` is configured with the *bundled* public-suffix snapshot
(``suffix_list_urls=()``) so it never touches the network — the environment
blocks outbound HTTP and domain normalisation must work offline. Collapsing
``www.bbc.co.uk`` and ``bbc.co.uk`` to the same registrable domain is what lets
a batch of messy pasted URLs reuse a single ``sources`` row.
"""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlsplit

import tldextract


@lru_cache(maxsize=1)
def _extractor() -> tldextract.TLDExtract:
    return tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)


def registrable_domain(url_or_host: str) -> str:
    """Return the registrable domain (e.g. ``bbc.co.uk``) for a URL or bare host.

    Falls back to the lowercased host when no public suffix matches (so an
    intranet-style host still yields a stable, comparable key).
    """

    text = url_or_host.strip().lower()
    host = urlsplit(text).hostname if "://" in text else text.split("/")[0].split(":")[0]
    host = host or ""
    result = _extractor()(host)
    registered = result.top_domain_under_public_suffix
    return registered or host
