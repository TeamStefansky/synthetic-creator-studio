"""KreaGenerationProvider — generate via the KREA API (https://api.krea.ai).

Matches KREA's documented REST API:
  - Auth:    Authorization: Bearer <API token>
  - Create:  POST /generate/image/krea/{model}   (default model: krea-2/large)
             body: {prompt, aspect_ratio, resolution, seed?, styles?:[{id,strength}]}
             → {job_id, status, result, error}
  - Result:  GET  /jobs/{job_id}  → poll until status == "completed",
             then the image URL(s) are in the job's `result`.

A persona's trained model (a KREA "style"/LoRA) is applied via the `styles`
list, not by replacing the base model. The provider returns raw image bytes;
visible labeling + provenance still happen in GenerationService (C1).
"""
from __future__ import annotations

import base64
import time

from app.config import get_settings
from app.constraints import StudioError
from app.generation.provider import GenerationProvider, GenerationRequest, GenerationResult
from app.models.asset import AssetKind

# KREA aspect-ratio enum (docs).
_ASPECTS = {
    "1:1": 1.0, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9, "2.35:1": 2.35,
    "4:5": 4 / 5, "2:3": 2 / 3, "9:16": 9 / 16,
}


def _nearest_aspect(width: int, height: int) -> str:
    if not width or not height:
        return "1:1"
    ratio = width / height
    return min(_ASPECTS, key=lambda k: abs(_ASPECTS[k] - ratio))


class KreaGenerationProvider(GenerationProvider):
    name = "krea"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None,
                 model: str | None = None, auth_scheme: str | None = None, client=None):
        s = get_settings()
        self.api_key = api_key or s.krea_api_key
        self.base_url = (base_url or s.krea_base_url).rstrip("/")
        self.model = model or s.krea_model          # path component, e.g. "krea-2/large"
        self.auth_scheme = (auth_scheme or s.krea_auth_scheme).lower()
        self.lora_strength = s.krea_lora_weight
        self.timeout = s.krea_timeout_s
        self._client = client
        if not self.api_key:
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
            return {"Authorization": f"Basic {base64.b64encode(self.api_key.encode()).decode()}"}
        if self.auth_scheme == "x-api-key":
            return {"x-api-key": self.api_key}
        return {"Authorization": f"Bearer {self.api_key}"}

    # ---- payload ---------------------------------------------------------
    def _build_payload(self, req: GenerationRequest) -> dict:
        vi = req.visual_identity or {}
        tags = vi.get("tags") if isinstance(vi.get("tags"), list) else []
        prompt = ", ".join([req.prompt, *tags]).strip(", ")
        payload = {
            "prompt": prompt,
            "aspect_ratio": _nearest_aspect(req.width, req.height),
            "resolution": "1K",
        }
        if req.seed is not None:
            payload["seed"] = req.seed
        if req.model_ref:
            # Apply the persona's trained KREA style (LoRA) on top of the base model.
            payload["styles"] = [{"id": req.model_ref, "strength": self.lora_strength}]
        return payload

    # ---- result parsing --------------------------------------------------
    @staticmethod
    def _first(d, *keys):
        for k in keys:
            if isinstance(d, dict) and d.get(k) is not None:
                return d[k]
        return None

    def _image_from_result(self, result) -> tuple[str | None, str | None]:
        """Return (url, b64) from a completed job's `result`."""
        if result is None:
            return None, None
        # result may be a list, a dict with images/output, or a direct url/b64.
        candidates = result if isinstance(result, list) else (
            self._first(result, "images", "output", "outputs", "data") or [result]
        )
        if isinstance(candidates, list):
            for it in candidates:
                if isinstance(it, str):
                    return (it, None) if it.startswith("http") else (None, it)
                if isinstance(it, dict):
                    url = self._first(it, "url", "image_url", "signed_url")
                    b64 = self._first(it, "b64_json", "b64", "base64")
                    if url or b64:
                        return url, b64
        if isinstance(result, dict):
            return self._first(result, "url", "image_url"), self._first(result, "b64_json")
        return None, None

    # ---- generate --------------------------------------------------------
    def generate(self, request: GenerationRequest) -> GenerationResult:
        if request.kind != AssetKind.IMAGE:
            raise StudioError("KreaGenerationProvider only generates images")

        http = self._http()
        headers = {**self._auth_headers(), "Content-Type": "application/json", "Accept": "application/json"}
        url = f"{self.base_url}/generate/image/krea/{self.model}"

        resp = http.post(url, json=self._build_payload(request), headers=headers)
        body = self._json(resp)
        if resp.status_code >= 400:
            raise StudioError(f"KREA generation failed ({resp.status_code}): {body}")

        job_id = self._first(body, "job_id", "id")
        status = str(self._first(body, "status", "state") or "").lower()
        img_url, b64 = self._image_from_result(body.get("result"))

        if not (img_url or b64):
            if not job_id:
                raise StudioError(f"KREA returned no job_id: {body}")
            img_url, b64 = self._poll_job(http, job_id, headers)

        if b64:
            return self._result(base64.b64decode(b64))
        if img_url:
            img = http.get(img_url)
            if img.status_code >= 400:
                raise StudioError(f"KREA image download failed ({img.status_code})")
            return self._result(img.content)
        raise StudioError("KREA job completed without an image")

    def _poll_job(self, http, job_id: str, headers: dict) -> tuple[str | None, str | None]:
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            r = http.get(f"{self.base_url}/jobs/{job_id}", headers=headers)
            body = self._json(r)
            status = str(self._first(body, "status", "state") or "").lower()
            img_url, b64 = self._image_from_result(body.get("result"))
            if img_url or b64:
                return img_url, b64
            if status in {"failed", "error", "cancelled", "canceled"}:
                raise StudioError(f"KREA job {job_id} {status}: {self._first(body, 'error') or body}")
            time.sleep(2)
        raise StudioError(f"KREA job {job_id} timed out after {self.timeout}s")

    def _result(self, content: bytes) -> GenerationResult:
        # KREA returns JPEG/PNG/WebP; PIL in the labeler handles any of them.
        fmt = "PNG" if content[:8] == b"\x89PNG\r\n\x1a\n" else "JPEG"
        return GenerationResult(kind=AssetKind.IMAGE, content=content, fmt=fmt,
                                meta={"provider": self.name, "model": self.model})

    @staticmethod
    def _json(resp) -> dict:
        try:
            return resp.json()
        except Exception:
            return {"raw": getattr(resp, "text", ""), "status_code": getattr(resp, "status_code", None)}
