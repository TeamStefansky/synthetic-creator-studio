"""KreaPersonaTrainer — upload → start → poll, with a mocked transport."""
from __future__ import annotations

import tempfile
from pathlib import Path

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
    def __init__(self, posts, gets=None):
        self.posts, self.gets, self.calls = list(posts), list(gets or []), []

    def post(self, url, json=None, files=None, headers=None, **k):
        self.calls.append({"m": "POST", "url": url, "json": json, "files": bool(files)})
        return self.posts.pop(0)

    def get(self, url, headers=None, **k):
        self.calls.append({"m": "GET", "url": url})
        return self.gets.pop(0)


def _images(n=3):
    d = Path(tempfile.mkdtemp(prefix="scs_kt_"))
    paths = []
    for i in range(n):
        p = d / f"i{i}.png"
        p.write_bytes(b"\x89PNG\r\n\x1a\n" + bytes([i]))
        paths.append(str(p))
    return paths


def _trainer(client):
    return KreaPersonaTrainer(api_key="krea_id:secret", client=client)


def test_train_uploads_then_returns_model_id_inline():
    client = _Client(posts=[
        _Resp({"id": "asset_1"}), _Resp({"id": "asset_2"}), _Resp({"id": "asset_3"}),
        _Resp({"model_id": "model_xyz", "status": "completed"}),
    ])
    result = _trainer(client).train(persona_id="p1", image_paths=_images(3), base_model="flux-1.1", meta={})
    assert result.model_ref == "model_xyz"
    # 3 uploads to /v1/assets then a start to /v1/trainings.
    assert sum(1 for c in client.calls if c["url"].endswith("/v1/assets")) == 3
    assert any(c["url"].endswith("/v1/trainings") for c in client.calls)


def test_train_polls_until_ready(monkeypatch):
    import app.generation.krea_trainer as mod

    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    client = _Client(
        posts=[_Resp({"id": "a1"}), _Resp({"id": "a2"}), _Resp({"id": "a3"}),
               _Resp({"id": "train_1", "status": "queued"})],
        gets=[_Resp({"status": "running"}), _Resp({"status": "completed", "model_id": "m_final"})],
    )
    result = _trainer(client).train(persona_id="p", image_paths=_images(3), base_model="flux", meta={})
    assert result.model_ref == "m_final"


def test_train_failure_fails_closed(monkeypatch):
    import app.generation.krea_trainer as mod

    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    client = _Client(
        posts=[_Resp({"id": "a1"}), _Resp({"id": "a2"}), _Resp({"id": "a3"}),
               _Resp({"id": "t1", "status": "queued"})],
        gets=[_Resp({"status": "failed", "error": "bad dataset"})],
    )
    with pytest.raises(StudioError):
        _trainer(client).train(persona_id="p", image_paths=_images(3), base_model="flux", meta={})


def test_train_requires_key():
    with pytest.raises(StudioError):
        KreaPersonaTrainer(api_key=None, client=_Client(posts=[]))
