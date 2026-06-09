"""API listing + asset-file endpoints that power the React studio UI."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def _seed():
    entity = client.post("/entities", json={"name": "Aurora", "contact_email": "x@aurora.example"}).json()
    persona = client.post("/personas", json={"responsible_entity_id": entity["id"], "name": "Nova"}).json()
    asset = client.post("/generate", json={"persona_id": persona["id"], "prompt": "studio portrait"}).json()
    return entity, persona, asset


def test_list_endpoints_return_seeded_rows():
    entity, persona, asset = _seed()

    entities = client.get("/entities").json()
    personas = client.get("/personas").json()
    assets = client.get(f"/personas/{persona['id']}/assets").json()

    assert any(e["id"] == entity["id"] for e in entities)
    assert any(p["id"] == persona["id"] for p in personas)
    assert any(a["id"] == asset["id"] and a["disclosure_status"] == "tagged" for a in assets)


def test_asset_file_streams_labeled_bytes():
    _, _, asset = _seed()
    r = client.get(f"/assets/{asset['id']}/file")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"  # a real PNG (visibly labeled)


def test_posts_listing_after_publish():
    _, _, asset = _seed()
    post = client.post("/distribution/schedule", json={"asset_id": asset["id"], "platform": "instagram"}).json()
    client.post(f"/distribution/posts/{post['id']}/approve")
    client.post(f"/distribution/posts/{post['id']}/publish")
    posts = client.get("/distribution/posts").json()
    assert any(p["id"] == post["id"] and p["approval_state"] == "published" for p in posts)
