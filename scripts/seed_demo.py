#!/usr/bin/env python3
"""Seed demo data into a running Synthetic Creator Studio backend.

Creates an accountable entity, a few disclosed personas, generates assets
(each visibly labeled + provenance-stamped), publishes some through the hard
gate, and ingests analytics so the dashboard is populated.

Usage: python scripts/seed_demo.py   (backend must be running on :8000)
Override the base URL with SCS_API_BASE.
"""
from __future__ import annotations

import json
import os
import random
import urllib.request

BASE = os.environ.get("SCS_API_BASE", "http://127.0.0.1:8000")


def _req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


post = lambda p, b=None: _req("POST", p, b if b is not None else {})
get = lambda p: _req("GET", p)


def main() -> None:
    existing = get("/personas")
    if existing:
        print(f"already seeded ({len(existing)} personas) — skipping.")
        return

    entity = post("/entities", {"name": "Aurora Labs", "contact_email": "brand@aurora.example"})
    palettes = {"Nova": [40, 120, 200], "Kai": [200, 90, 60], "Lumi": [120, 80, 200]}
    prompts = [
        "studio portrait, soft window light, warm tones",
        "golden hour rooftop, candid smile",
        "minimalist set, brand colors",
        "editorial neon city night",
    ]

    for name, color in palettes.items():
        persona = post(
            "/personas",
            {
                "responsible_entity_id": entity["id"],
                "name": name,
                "backstory": f"{name} is a disclosed virtual brand ambassador.",
                "voice_tone": "warm, upbeat, clearly AI",
                "visual_identity": {"base_color": color, "tags": ["studio", "portrait"]},
            },
        )
        pid = persona["id"]
        for pr in prompts:
            post("/generate", {"persona_id": pid, "prompt": pr})

        assets = get(f"/personas/{pid}/assets")
        for a in assets[:2]:
            p = post("/distribution/schedule", {"asset_id": a["id"], "platform": random.choice(["instagram", "tiktok"])})
            post(f"/distribution/posts/{p['id']}/approve")
            try:
                post(f"/distribution/posts/{p['id']}/publish")
            except Exception:
                pass

        for platform in ("instagram", "tiktok"):
            for metric, base in [("reach", 22000), ("engagement", 0.05), ("growth", 0.03), ("sentiment", 0.45)]:
                post("/analytics/events", {"persona_id": pid, "platform": platform, "metric": metric,
                                           "value": round(base * (0.8 + 0.4 * random.random()), 4)})

    print(f"seeded {len(palettes)} personas, assets, posts, and analytics. Open http://localhost:3000")


if __name__ == "__main__":
    main()
