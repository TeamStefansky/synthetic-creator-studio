"""KreaGenerationProvider — generate via the KREA API (https://krea.ai).

Implements the ``GenerationProvider`` interface, so it only produces *raw* image
bytes — the visible AI label and provenance stamping still happen in
``GenerationService`` (C1 cannot be bypassed), and prompts are screened for
real-person impersonation (C4) before reaching here.

The credential is read from ``SCS_KREA_API_KEY`` (never hard-coded). Base URL,
model, and auth scheme are configurable so the integration can be pointed at the
current KREA endpoints without code changes.

Flow (covers the common shapes of image-gen REST APIs):
  1. POST ``{base}/v1/generations`` with the prompt → response.
  2. If the response already contains an image (URL or base64), use it.
  3. Otherwise treat it as an async job and poll
     ``{base}/v1/generations/{id}`` until it completes, then download.

Network access to KREA was not available in the build sandbox, so this provider
is covered by mocked-transport tests rather than a live call. If KREA's request
or response shape differs, adjust ``_build_payload`` / ``_extract_image_ref``.
"""
from __future__ import annotations

import base64
import time

from app.config import get_settings
from app.constraints import StudioError
from app.generation.provider import GenerationProvider, GenerationRequest, GenerationResult
from app.models.asset import AssetKind


class KreaGenerationProvider(GenerationProvider):
    name = "krea"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None,
                 model: str | None = None, auth_scheme: str | None = None, client=None):
        s = get_settings()
        self.api_key = api_key or s.krea_api_key
        self.base_url = (base_url or s.krea_base_url).rstrip("/")
        self.model = model or s.krea_model
        self.auth_scheme = (auth_scheme or s.krea_auth_scheme).lower()
        self.timeout = s.krea_timeout_s
        self._client = client
        if not self.api_key:
            # Fail closed (C6): never silently "generate nothing".
            raise StudioError("KREA provider requires SCS_KREA_API_KEY to be set")

    # ---- http ------------------------------------------------------------
    def _http(self):
        if self._client is not None:
            return self._client
        import httpx

        self._client = httpx.Client(timeout=self.timeout)
        return self._client

    def _auth_headers(self) -> dict:
        if self.auth_scheme == "basic":
            token = base64.b64encode(self.api_key.encode()).decode()
            return {"Authorization": f"Basic {token}"}
        if self.auth_scheme == "x-api-key":
            return {"x-api-key": self.api_key}
        return {"Authorization": f"Bearer {self.api_key}"}

    # ---- payload / parsing ----------------------------------------------
    def _build_payload(self, req: GenerationRequest) -> dict:
        vi = req.visual_identity or {}
        style = ", ".join(vi.get("tags", [])) if isinstance(vi.get("tags"), list) else ""
        prompt = f"{req.prompt}, {style}".strip(", ")
        payload = {
            # Use the persona's trained model when available (KREA Train output),
            # otherwise the configured base model.
            "model": req.model_ref or self.model,
            "prompt": prompt,
            "width": req.width,
            "height": req.height,
            "num_images": 1,
        }
        if req.negative_prompt:
            payload["negative_prompt"] = req.negative_prompt
        if req.seed is not None:
            payload["seed"] = req.seed
        return payload

    @staticmethod
    def _first(d, *keys):
        for k in keys:
            if isinstance(d, dict) and d.get(k) is not None:
                return d[k]
        return None

    def _extract_image_ref(self, body: dict) -> tuple[str | None, str | None, str | None]:
        """Return (url, b64, job_id) from a KREA-style response."""
        if not isinstance(body, dict):
            return None, None, None
        # Common containers: data/images/outputs/output/result.
        items = (
            self._first(body, "images", "data", "outputs", "output")
            or (body.get("result") or {}).get("images")
            or []
        )
        if isinstance(items, list) and items:
            it = items[0]
            if isinstance(it, str):
                return (it, None, None) if it.startswith("http") else (None, it, None)
            if isinstance(it, dict):
                return self._first(it, "url", "image_url"), self._first(it, "b64_json", "b64", "base64"), None
        # Direct fields.
        url = self._first(body, "image_url", "url")
        b64 = self._first(body, "b64_json", "image_base64")
        job_id = self._first(body, "id", "job_id", "request_id", "generation_id")
        return url, b64, job_id

    @staticmethod
    def _status(body: dict) -> str:
        return str(KreaGenerationProvider._first(body, "status", "state") or "").lower()

    # ---- generate --------------------------------------------------------
    def generate(self, request: GenerationRequest) -> GenerationResult:
        if request.kind != AssetKind.IMAGE:
            raise StudioError("KreaGenerationProvider only generates images")

        http = self._http()
        headers = {**self._auth_headers(), "Content-Type": "application/json", "Accept": "application/json"}

        resp = http.post(f"{self.base_url}/v1/generations", json=self._build_payload(request), headers=headers)
        body = self._json(resp)
        if resp.status_code >= 400:
            raise StudioError(f"KREA generation failed ({resp.status_code}): {body}")

        url, b64, job_id = self._extract_image_ref(body)

        # Async job → poll to completion.
        if not (url or b64) and job_id:
            url, b64 = self._poll(http, job_id, headers)

        if b64:
            content = base64.b64decode(b64)
        elif url:
            img = http.get(url, headers=self._auth_headers())
            if img.status_code >= 400:
                raise StudioError(f"KREA image download failed ({img.status_code})")
            content = img.content
        else:
            raise StudioError(f"KREA response contained no image: {body}")

        return GenerationResult(
            kind=AssetKind.IMAGE,
            content=content,
            fmt="PNG",
            meta={"provider": self.name, "model": self.model},
        )

    def _poll(self, http, job_id: str, headers: dict) -> tuple[str | None, str | None]:
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            r = http.get(f"{self.base_url}/v1/generations/{job_id}", headers=headers)
            body = self._json(r)
            status = self._status(body)
            url, b64, _ = self._extract_image_ref(body)
            if url or b64:
                return url, b64
            if status in {"failed", "error", "canceled", "cancelled"}:
                raise StudioError(f"KREA job {job_id} {status}: {body}")
            time.sleep(2)
        raise StudioError(f"KREA job {job_id} timed out after {self.timeout}s")

    @staticmethod
    def _json(resp) -> dict:
        try:
            return resp.json()
        except Exception:
            return {"raw": getattr(resp, "text", ""), "status_code": getattr(resp, "status_code", None)}
