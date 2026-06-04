"""TikTokAdapter — official TikTok Content Posting API publishing (C5).

Uses TikTok's Direct Post flow: initialize a content-publish request with the
media pulled from a public URL, and mark it as AI-generated content (AIGC) per
TikTok's synthetic-media policy. Official API only — no scraping, no credential
sharing, no rate-limit evasion. The httpx client is injectable so request
building + the AIGC-label logic are unit-testable without hitting TikTok.

Auth is via a per-account OAuth access token supplied by the deployment.
"""
from __future__ import annotations

from app.constraints import Constraint, PlatformPolicyError
from app.distribution.adapters import PlatformAdapter, PublishOutcome
from app.models.asset import Asset

TIKTOK_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/"


class TikTokAdapter(PlatformAdapter):
    platform = "tiktok"

    def __init__(self, *, access_token: str, asset_url_resolver, client=None):
        self.access_token = access_token
        # Callable(asset) -> public https URL TikTok can fetch.
        self._resolve_url = asset_url_resolver
        self._client = client

    def _http(self):
        if self._client is not None:
            return self._client
        import httpx

        self._client = httpx.Client(timeout=30.0)
        return self._client

    def publish(self, asset: Asset, *, caption: str | None = None) -> PublishOutcome:
        policy = self.policy  # C5: ensures a synthetic-media policy is registered
        if not self.access_token:
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                "missing TikTok access token — refusing to publish",
            )

        media_url = self._resolve_url(asset)
        if not (media_url and media_url.startswith("https://")):
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                "asset must be served over https for the TikTok Content Posting API",
            )

        payload = {
            "post_info": {
                "title": caption or "",
                # AIGC disclosure: TikTok requires synthetic media to be labeled.
                policy.ai_label_field: True,
            },
            "source_info": {
                "source": "PULL_FROM_URL",
                "photo_cover_index": 0,
                "photo_images": [media_url],
            },
            "post_mode": "DIRECT_POST",
            "media_type": "PHOTO",
        }
        resp = self._http().post(
            TIKTOK_INIT_URL,
            json=payload,
            headers={"Authorization": f"Bearer {self.access_token}"},
        )
        body = _json(resp)

        # TikTok returns {data: {publish_id}, error: {code: "ok"|...}}.
        error = (body or {}).get("error") or {}
        if error.get("code") not in (None, "ok"):
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                f"TikTok publish init failed: {error}",
            )
        publish_id = (body.get("data") or {}).get("publish_id")
        if not publish_id:
            raise PlatformPolicyError(
                Constraint.PLATFORM_COMPLIANT_ONLY,
                f"TikTok publish init returned no publish_id: {body}",
            )

        return PublishOutcome(
            platform=self.platform,
            external_post_id=str(publish_id),
            ai_label_set=True,  # AIGC field set in post_info
            raw={"policy_field": policy.ai_label_field},
        )


def _json(response) -> dict:
    try:
        return response.json()
    except Exception:
        return {"error": {"code": "non_json", "status_code": getattr(response, "status_code", None)}}
