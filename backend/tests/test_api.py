"""API smoke test — the full lifecycle through HTTP, with the law enforced."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_full_lifecycle_via_api():
    # 1) responsible entity (C3)
    r = client.post("/entities", json={"name": "Acme", "contact_email": "x@acme.example"})
    assert r.status_code == 201, r.text
    entity_id = r.json()["id"]

    # 2) persona — comes back WITH a synthetic_identity (C3)
    r = client.post("/personas", json={"responsible_entity_id": entity_id, "name": "Nova"})
    assert r.status_code == 201, r.text
    body = r.json()
    persona_id = body["id"]
    assert body["synthetic_identity"]["ai_generated"] is True

    # 3) generate → tagged with provenance (C1)
    r = client.post("/generate", json={"persona_id": persona_id, "prompt": "studio portrait"})
    assert r.status_code == 201, r.text
    asset = r.json()
    assert asset["disclosure_status"] == "tagged"
    asset_id = asset["id"]

    # 4) schedule + publish through the hard gate (C2/C5)
    r = client.post("/distribution/schedule", json={"asset_id": asset_id, "platform": "instagram"})
    assert r.status_code == 201, r.text
    post_id = r.json()["id"]
    r = client.post(f"/distribution/posts/{post_id}/publish")
    assert r.status_code == 200, r.text
    assert r.json()["approval_state"] == "published"

    # 5) compliance view confirms disclosure (M7)
    r = client.get(f"/analytics/personas/{persona_id}/compliance")
    assert r.status_code == 200
    assert r.json()["compliant"] is True


def test_impersonation_persona_rejected_via_api():
    r = client.post("/entities", json={"name": "Acme", "contact_email": "x@acme.example"})
    entity_id = r.json()["id"]
    r = client.post(
        "/personas",
        json={"responsible_entity_id": entity_id, "name": "Fake",
              "backstory": "totally a real human, not an AI"},
    )
    assert r.status_code == 422
    assert r.json()["constraint"] == "C4_NO_REAL_PERSON_IMPERSONATION"


def test_constraints_endpoint_lists_the_law():
    r = client.get("/constraints")
    assert r.status_code == 200
    assert "C2_NO_PUBLISH_WITHOUT_DISCLOSURE" in r.json()
