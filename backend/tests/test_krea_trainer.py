"""KreaPersonaTrainer — POST /styles/train + resolve via /jobs (mocked transport)."""
from __future__ import annotations

import pytest

from app.constraints import StudioError
from app.generation.krea_trainer import KreaPersonaTrainer


class _Resp:
    def __init__(self, payload=None, status=200):
        self._payload, self.status_code, self.text = payload, status, ""

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class _Client:
    def __init__(self, posts=None, gets=None):
        self.posts, self.gets, self.calls = list(posts or []), list(gets or []), []

    def post(self, url, json=None, headers=None, **k):
        self.calls.append({"m": "POST", "url": url, "json": json, "headers": headers})
        return self.posts.pop(0)

    def get(self, url, headers=None, **k):
        self.calls.append({"m": "GET", "url": url, "headers": headers})
        return self.gets.pop(0)


def _trainer(client):
    return KreaPersonaTrainer(api_key="krea_id:secret", client=client)


def test_train_posts_styles_train_with_urls_and_returns_pending():
    client = _Client(posts=[_Resp({"job_id": "job_1", "status": "queued"})])
    urls = ["https://b/1.png", "https://b/2.png", "https://b/3.png"]
    result = _trainer(client).train(
        persona_id="p1", image_paths=urls, base_model="flux_dev",
        meta={"name": "Nova", "optimize_for": "character"},
    )
    assert result.pending is True and result.job_id == "job_1"
    post = client.calls[0]
    assert post["url"].endswith("/styles/train")
    assert post["headers"]["Authorization"] == "Bearer krea_id:secret"
    body = post["json"]
    assert body["name"] == "Nova"
    assert body["type"] == "Character"          # optimize_for mapped to KREA type
    assert body["urls"] == urls                  # images passed as URLs (no upload step)
    assert body["model"] == "flux_dev"


def test_invalid_base_model_falls_back_to_valid():
    client = _Client(posts=[_Resp({"job_id": "j", "status": "queued"})])
    _trainer(client).train(persona_id="p", image_paths=["https://b/1.png"],
                           base_model="flux", meta={"name": "x"})  # "flux" is not valid
    assert client.calls[0]["json"]["model"] == "flux_dev"


def test_resolve_completed_returns_style_id():
    client = _Client(gets=[_Resp({"status": "completed", "result": {"style_id": "style_42"}})])
    status, style_id = _trainer(client).resolve("job_1")
    assert status == "ready" and style_id == "style_42"
    assert client.calls[0]["url"].endswith("/jobs/job_1")


def test_resolve_still_running():
    client = _Client(gets=[_Resp({"status": "processing", "result": None})])
    status, style_id = _trainer(client).resolve("j")
    assert status == "training" and style_id is None


def test_resolve_failed():
    client = _Client(gets=[_Resp({"status": "failed", "result": None, "error": {"code": "x"}})])
    status, style_id = _trainer(client).resolve("j")
    assert status == "failed" and style_id is None


def test_train_http_error_fails_closed():
    client = _Client(posts=[_Resp({"error": "bad"}, status=400)])
    with pytest.raises(StudioError):
        _trainer(client).train(persona_id="p", image_paths=["https://b/1.png"], base_model="flux_dev", meta={})


def test_train_requires_key():
    with pytest.raises(StudioError):
        KreaPersonaTrainer(api_key=None, client=_Client())
