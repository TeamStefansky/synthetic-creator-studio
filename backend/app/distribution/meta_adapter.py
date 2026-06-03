"""MetaInstagramAdapter — official Instagram Graph API publishing (C5).

Implements the standard two-step Instagram Content Publishing flow:
  1. POST /{ig_user_id}/media          → create a media container
  2. POST /{ig_user_id}/media_publish  → publish the container

It sets Meta's AI-disclosure field on the container so synthetic media is
labeled per Meta policy. This is an official-API integration only — no scraping,
no credential sharing, no rate-limit evasion (C5). Network calls go through an
injectable httpx client so the request-building + policy logic is unit-testable
without hitting Meta.

Auth is via a user/page access token supplied by the deployment (never shared
between accounts). The asset's public URL must be reachable by Meta's servers.
"""
from __future__ import annotations

from app.constraints import Constraint, PlatformPolicyError
from app.distribution.adapters import PlatformAdapter, PublishOutcome
from app.models.asset import Asset

GRAPH_BASE = "https://graph.facebook.com/v21.0"


class MetaInstagramAdapter(PlatformAdapter):
    platform = "instagram"

    def __init__(self, *, ig_user_id: str, access_token: str, asset_url_resolver, client=None):
        self.ig_user_id = ig_user_id
        self.access_token = access_token
        # Callable(asset) -> public https URL Meta can fetch.
        self._resolve_url = asset_url_resolver
        self._client = client  # httpx.Client-like; lazily created if None.

    def _http(self):
        if self._client is not None:
            return self._client
        import httpx

        self._client = httpx.Client(timeout=30.0)
        return self._client

    def publish(self, asset: Asset, *, caption: str | None = None) -> PublishOutcome:
        policy = self.policy  # C5: ensures a synthetic-media policy is registered
        if not self.access_token or not self.ig_user_id:
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                "missing Instagram credentials — refusing to publish",
            )

        media_url = self._resolve_url(asset)
        if not (media_url and media_url.startswith("https://")):
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                "asset must be served over https for the Instagram Graph API",
            )

        http = self._http()

        # Step 1 — create container, marking it AI-generated (Meta policy).
        create = http.post(
            f"{GRAPH_BASE}/{self.ig_user_id}/media",
            data={
                "image_url": media_url,
                "caption": caption or "",
                # Meta's AI-disclosure flag (the policy's ai_label_field).
                "ai_info": '{"is_ai_generated": true}',
                "access_token": self.access_token,
            },
        )
        container = _json(create)
        container_id = container.get("id")
        if not container_id:
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                f"Instagram media container creation failed: {container}",
            )

        # Step 2 — publish the container.
        publish = http.post(
            f"{GRAPH_BASE}/{self.ig_user_id}/media_publish",
            data={"creation_id": container_id, "access_token": self.access_token},
        )
        published = _json(publish)
        post_id = published.get("id")
        if not post_id:
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                f"Instagram publish failed: {published}",
            )

        return PublishOutcome(
            platform=self.platform,
            external_post_id=str(post_id),
            ai_label_set=True,  # ai_info.is_ai_generated was set on the container
            raw={"container_id": container_id, "policy_field": policy.ai_label_field},
        )


def _json(response) -> dict:
    try:
        return response.json()
    except Exception:
        return {"error": "non-json response", "status_code": getattr(response, "status_code", None)}
