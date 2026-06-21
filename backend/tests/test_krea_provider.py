"""KreaGenerationProvider — request building, response shapes, and fail-closed.

Uses a fake httpx-style client (no network). Also proves that KREA output still
flows through disclosure: the emitted asset is labeled + provenance-stamped (C1).
"""
from __future__ import annotations

import base64
import io

import pytest

from app.constraints import StudioError
from app.generation.factory import get_provider
from app.generation.krea_provider import KreaGenerationProvider
from app.generation.provider import GenerationRequest
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider
from app.models.asset import AssetKind, DisclosureStatus


def _png_bytes(color=(40, 120, 200)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color).save(buf, "PNG")
    return buf.getvalue()


class _Resp:
    def __init__(self, payload=None, content=None, status=200):
        self._payload, self.content, self.status_code, self.text = payload, content, status, ""

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class _Client:
    def __init__(self, posts, gets=None):
        self.posts, self.gets, self.calls = list(posts), list(gets or []), []

    def post(self, url, json=None, headers=None, **k):
        self.calls.append({"m": "POST", "url": url, "json": json, "headers": headers})
        return self.posts.pop(0)

    def get(self, url, headers=None, **k):
        self.calls.append({"m": "GET", "url": url, "headers": headers})
        return self.gets.pop(0)


def _provider(client, **kw):
    return KreaGenerationProvider(api_key="krea_id:secret", client=client, **kw)


def _req(prompt="studio portrait"):
    return GenerationRequest(persona_id="p", prompt=prompt, kind=AssetKind.IMAGE,
                             visual_identity={"tags": ["studio"]})


def test_inline_url_downloads_bytes_and_sends_auth():
    png = _png_bytes()
    client = _Client(
        posts=[_Resp(payload={"images": [{"url": "https://cdn.krea/x.png"}]})],
        gets=[_Resp(content=png)],
    )
    result = _provider(client).generate(_req("brand portrait"))

    assert result.content == png and result.kind == AssetKind.IMAGE
    post = client.calls[0]
    # id:secret credentials default to HTTP Basic auth.
    assert post["headers"]["Authorization"] == "Basic " + base64.b64encode(b"krea_id:secret").decode()
    assert "brand portrait" in post["json"]["prompt"]
    assert post["json"]["model"]  # a model was sent


def test_bearer_auth_scheme_when_configured():
    png = _png_bytes()
    client = _Client(posts=[_Resp(payload={"images": [{"b64_json": base64.b64encode(png).decode()}]})])
    _provider(client, auth_scheme="bearer").generate(_req())
    assert client.calls[0]["headers"]["Authorization"] == "Bearer krea_id:secret"


def test_base64_response_decoded_without_download():
    png = _png_bytes((200, 90, 60))
    client = _Client(posts=[_Resp(payload={"images": [{"b64_json": base64.b64encode(png).decode()}]})])
    result = _provider(client).generate(_req())
    assert result.content == png
    assert all(c["m"] != "GET" for c in client.calls)  # no download needed


def test_async_job_is_polled_to_completion(monkeypatch):
    import app.generation.krea_provider as mod

    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    png = _png_bytes()
    client = _Client(
        posts=[_Resp(payload={"id": "job_1", "status": "queued"})],
        gets=[
            _Resp(payload={"status": "processing"}),
            _Resp(payload={"status": "completed", "images": [{"b64_json": base64.b64encode(png).decode()}]}),
        ],
    )
    result = _provider(client).generate(_req())
    assert result.content == png
    assert any("/v1/generations/job_1" in c.get("url", "") for c in client.calls)


def test_failed_job_fails_closed(monkeypatch):
    import app.generation.krea_provider as mod

    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    client = _Client(
        posts=[_Resp(payload={"id": "job_2", "status": "queued"})],
        gets=[_Resp(payload={"status": "failed", "error": "nsfw"})],
    )
    with pytest.raises(StudioError):
        _provider(client).generate(_req())


def test_http_error_fails_closed():
    client = _Client(posts=[_Resp(payload={"error": "unauthorized"}, status=401)])
    with pytest.raises(StudioError):
        _provider(client).generate(_req())


def test_missing_key_fails_closed():
    with pytest.raises(StudioError):
        KreaGenerationProvider(api_key=None, client=_Client(posts=[]))


def test_basic_auth_scheme_header():
    png = _png_bytes()
    client = _Client(posts=[_Resp(payload={"image_url": "https://cdn.krea/y.png"})], gets=[_Resp(content=png)])
    _provider(client, auth_scheme="basic").generate(_req())
    expected = "Basic " + base64.b64encode(b"krea_id:secret").decode()
    assert client.calls[0]["headers"]["Authorization"] == expected


def test_factory_krea_fallback_and_failclosed():
    # No key configured in the test env.
    assert isinstance(get_provider("krea", allow_fallback=True), StubGenerationProvider)
    with pytest.raises(StudioError):
        get_provider("krea", allow_fallback=False)


def test_krea_output_is_disclosed(session, persona):
    """KREA bytes still get the visible label + provenance via GenerationService."""
    png = _png_bytes()
    client = _Client(posts=[_Resp(payload={"images": [{"b64_json": base64.b64encode(png).decode()}]})])
    service = GenerationService(session, _provider(client))
    asset = service.generate_asset(persona_id=persona.id, prompt="cheerful studio portrait")

    assert asset.disclosure_status == DisclosureStatus.TAGGED
    assert asset.provenance_manifest is not None and asset.storage_uri
