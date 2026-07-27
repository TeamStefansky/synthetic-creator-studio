"""Single rate-limited HTTP client for feed discovery and OG extraction.

Every outbound fetch in the P5 source layer goes through a :class:`Fetcher`:

* per-host concurrency is capped at 2,
* a 15s timeout applies to every request,
* a descriptive User-Agent (with a contact URL) is always sent,
* an SSRF guard rejects private / loopback / link-local hosts, and
* ``robots.txt`` is honoured for the OG-extraction fetch.

The abstraction is a small :class:`Fetcher` protocol so discovery and OG
extraction can be tested against **recorded fixtures** (no live network), while
production uses :class:`HttpFetcher` over ``httpx``.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from newsradar.config import Settings, get_settings
from newsradar.logging import get_logger

log = get_logger(__name__)

DEFAULT_TIMEOUT_SECONDS = 15.0
PER_HOST_CONCURRENCY = 2
MAX_HEAD_BYTES = 64 * 1024


@dataclass(slots=True)
class FetchResult:
    """The outcome of one HTTP fetch (final URL after redirects, headers lower-cased)."""

    url: str
    status_code: int
    headers: dict[str, str]
    text: str
    content: bytes = b""

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300


@runtime_checkable
class Fetcher(Protocol):
    """A minimal HTTP surface used by discovery and OG extraction."""

    async def get(self, url: str, headers: dict[str, str] | None = None) -> FetchResult: ...

    async def head(self, url: str, headers: dict[str, str] | None = None) -> FetchResult: ...

    async def get_ranged(
        self, url: str, max_bytes: int = MAX_HEAD_BYTES, headers: dict[str, str] | None = None
    ) -> FetchResult: ...

    async def robots_allowed(self, url: str) -> bool: ...

    async def aclose(self) -> None: ...


class SsrfError(RuntimeError):
    """Raised when a URL targets a disallowed (private / loopback) host or scheme."""


def _is_blocked_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def is_safe_url(url: str) -> bool:
    """Return True if ``url`` is safe to fetch (public http/https host).

    Rejects non-http(s) schemes, empty hosts, ``localhost`` / ``*.local`` and any
    host that is (or resolves to) a private, loopback, link-local or reserved IP.
    A DNS-resolution failure is *not* treated as unsafe: the fetch will simply
    fail naturally rather than falsely blocking a legitimate site.
    """

    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return False
    host = parts.hostname
    if not host:
        return False
    lowered = host.lower()
    if lowered == "localhost" or lowered.endswith(".local") or lowered.endswith(".localhost"):
        return False
    if _is_blocked_ip(lowered):
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return True  # cannot resolve; let the request fail on its own
    return not any(_is_blocked_ip(str(info[4][0])) for info in infos)


class HttpFetcher:
    """Production :class:`Fetcher` over ``httpx`` with per-host concurrency + SSRF guard."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = httpx.AsyncClient(
            headers={"User-Agent": self._settings.connector_user_agent},
            timeout=httpx.Timeout(DEFAULT_TIMEOUT_SECONDS),
            follow_redirects=True,
        )
        self._host_locks: dict[str, asyncio.Semaphore] = {}
        self._robots: dict[str, RobotFileParser] = {}

    def _semaphore(self, host: str) -> asyncio.Semaphore:
        sem = self._host_locks.get(host)
        if sem is None:
            sem = asyncio.Semaphore(PER_HOST_CONCURRENCY)
            self._host_locks[host] = sem
        return sem

    @staticmethod
    def _to_result(resp: httpx.Response, *, text: str | None = None) -> FetchResult:
        return FetchResult(
            url=str(resp.url),
            status_code=resp.status_code,
            headers={k.lower(): v for k, v in resp.headers.items()},
            text=text if text is not None else resp.text,
            content=resp.content if text is None else text.encode("utf-8", "replace"),
        )

    async def get(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        if not is_safe_url(url):
            raise SsrfError(f"refusing to fetch unsafe URL: {url}")
        host = urlsplit(url).hostname or ""
        async with self._semaphore(host):
            resp = await self._client.get(url, headers=headers)
        return self._to_result(resp)

    async def head(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        if not is_safe_url(url):
            raise SsrfError(f"refusing to fetch unsafe URL: {url}")
        host = urlsplit(url).hostname or ""
        async with self._semaphore(host):
            resp = await self._client.head(url, headers=headers)
        return self._to_result(resp, text="")

    async def get_ranged(
        self, url: str, max_bytes: int = MAX_HEAD_BYTES, headers: dict[str, str] | None = None
    ) -> FetchResult:
        if not is_safe_url(url):
            raise SsrfError(f"refusing to fetch unsafe URL: {url}")
        host = urlsplit(url).hostname or ""
        merged = {"Range": f"bytes=0-{max_bytes - 1}", **(headers or {})}
        async with self._semaphore(host):
            resp = await self._client.get(url, headers=merged)
        # Truncate defensively in case the server ignored the Range header.
        raw = resp.content[:max_bytes]
        return FetchResult(
            url=str(resp.url),
            status_code=resp.status_code,
            headers={k.lower(): v for k, v in resp.headers.items()},
            text=raw.decode("utf-8", "replace"),
            content=raw,
        )

    async def robots_allowed(self, url: str) -> bool:
        """Whether ``robots.txt`` permits our User-Agent to fetch ``url``.

        Failures (missing / unfetchable robots) default to *allowed*, matching
        the conventional interpretation of an absent robots file.
        """

        parts = urlsplit(url)
        root = f"{parts.scheme}://{parts.netloc}"
        parser = self._robots.get(root)
        if parser is None:
            parser = RobotFileParser()
            try:
                res = await self.get(f"{root}/robots.txt")
                if res.ok:
                    parser.parse(res.text.splitlines())
                else:
                    parser.parse([])
            except Exception:  # noqa: BLE001 - absent/broken robots -> allow
                parser.parse([])
            self._robots[root] = parser
        return parser.can_fetch(self._settings.connector_user_agent, url)

    async def aclose(self) -> None:
        await self._client.aclose()


@dataclass(slots=True)
class RecordedFetcher:
    """A :class:`Fetcher` backed by pre-recorded responses (for offline tests).

    ``responses`` maps an absolute URL to a :class:`FetchResult`. Unknown URLs
    return a synthetic ``404``. ``requests`` records the fetch order so tests can
    assert the per-site request budget was respected.
    """

    responses: dict[str, FetchResult]
    robots: dict[str, bool] = field(default_factory=dict)
    requests: list[str] = field(default_factory=list)

    def _lookup(self, url: str) -> FetchResult:
        self.requests.append(url)
        hit = self.responses.get(url)
        if hit is not None:
            return hit
        return FetchResult(url=url, status_code=404, headers={}, text="", content=b"")

    async def get(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        return self._lookup(url)

    async def head(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        return self._lookup(url)

    async def get_ranged(
        self, url: str, max_bytes: int = MAX_HEAD_BYTES, headers: dict[str, str] | None = None
    ) -> FetchResult:
        res = self._lookup(url)
        return FetchResult(
            url=res.url,
            status_code=res.status_code,
            headers=res.headers,
            text=res.text[:max_bytes],
            content=res.content[:max_bytes],
        )

    async def robots_allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        root = f"{parts.scheme}://{parts.netloc}"
        return self.robots.get(root, True)

    async def aclose(self) -> None:
        return None
