"""KreaGenerationProvider — matches KREA's real REST API (mocked transport).

POST /generate/image/krea/{model} → job; GET /jobs/{id} → result; Bearer auth;
trained model applied via the `styles` list. Also proves KREA output is disclosed.
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


def _req(prompt="studio portrait", model_ref=None):
    return GenerationRequest(persona_id="p", prompt=prompt, kind=AssetKind.IMAGE,
                             model_ref=model_ref, visual_identity={"tags": ["studio"]})


def test_generate_uses_bearer_correct_endpoint_and_required_fields():
    png = _png_bytes()
    client = _Client(posts=[_Resp({"job_id": "j1", "status": "completed",
                                   "result": {"images": [{"b64_json": base64.b64encode(png).decode()}]}})])
    result = _provider(client).generate(_req("brand portrait"))

    assert result.content == png and result.kind == AssetKind.IMAGE
    post = client.calls[0]
    assert post["url"].endswith("/generate/image/krea/krea-2/large")
    assert post["headers"]["Authorization"] == "Bearer krea_id:secret"
    body = post["json"]
    assert body["prompt"].startswith("brand portrait")
    assert body["resolution"] == "1K"
    assert body["aspect_ratio"] in {"1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"}


def test_trained_model_applied_as_style_not_base_model():
    png = _png_bytes()
    client = _Client(posts=[_Resp({"job_id": "j", "status": "completed",
                                   "result": {"images": [{"b64_json": base64.b64encode(png).decode()}]}})])
    _provider(client).generate(_req(model_ref="style_123"))
    body = client.calls[0]["json"]
    assert body.get("styles") == [{"id": "style_123", "strength": 1.0}]
    assert "model" not in body  # model is in the URL path, not the body


def test_no_styles_without_trained_model():
    png = _png_bytes()
    client = _Client(posts=[_Resp({"job_id": "j", "status": "completed",
                                   "result": {"images": [{"b64_json": base64.b64encode(png).decode()}]}})])
    _provider(client).generate(_req())
    assert "styles" not in client.calls[0]["json"]


def test_generate_polls_job_then_downloads(monkeypatch):
    import app.generation.krea_provider as mod

    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    png = _png_bytes()
    client = _Client(
        posts=[_Resp({"job_id": "j1", "status": "queued", "result": None})],
        gets=[
            _Resp({"status": "processing", "result": None}),
            _Resp({"status": "completed", "result": {"images": [{"url": "https://cdn.krea/x.png"}]}}),
            _Resp(content=png),  # image download
        ],
    )
    result = _provider(client).generate(_req())
    assert result.content == png
    assert any(c["url"].endswith("/jobs/j1") for c in client.calls)


def test_failed_job_fails_closed(monkeypatch):
    import app.generation.krea_provider as mod

    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    client = _Client(
        posts=[_Resp({"job_id": "j2", "status": "queued", "result": None})],
        gets=[_Resp({"status": "failed", "result": None, "error": {"code": "nsfw"}})],
    )
    with pytest.raises(StudioError):
        _provider(client).generate(_req())


def test_http_error_fails_closed():
    client = _Client(posts=[_Resp({"error": "unauthorized"}, status=401)])
    with pytest.raises(StudioError):
        _provider(client).generate(_req())


def test_missing_key_fails_closed():
    with pytest.raises(StudioError):
        KreaGenerationProvider(api_key=None, client=_Client(posts=[]))


def test_factory_krea_fallback_and_failclosed():
    assert isinstance(get_provider("krea", allow_fallback=True), StubGenerationProvider)
    with pytest.raises(StudioError):
        get_provider("krea", allow_fallback=False)


def test_krea_output_is_disclosed(session, persona):
    png = _png_bytes()
    client = _Client(posts=[_Resp({"job_id": "j", "status": "completed",
                                   "result": {"images": [{"b64_json": base64.b64encode(png).decode()}]}})])
    service = GenerationService(session, _provider(client))
    asset = service.generate_asset(persona_id=persona.id, prompt="cheerful studio portrait")
    assert asset.disclosure_status == DisclosureStatus.TAGGED
    assert asset.provenance_manifest is not None and asset.storage_uri
