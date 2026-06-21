"""KreaPersonaTrainer — train a persona model from reference images via KREA Train.

Mirrors KREA's "Train" flow: upload the reference images, start a training job,
poll until the trained model is ready, and return its model id (used as the
generation model for that persona).

As with the generation provider, KREA was unreachable from the build sandbox, so
this is covered by mocked-transport tests and is fully env-configurable
(base URL, endpoints, auth) to match KREA's current Train API without code
changes. Adjust ``_start_payload`` / ``_extract_model_ref`` if shapes differ.
"""
from __future__ import annotations

import time

from app.config import get_settings
from app.constraints import StudioError
from app.generation.krea_provider import KreaGenerationProvider
from app.generation.trainer import PersonaTrainer, TrainResult


class KreaPersonaTrainer(PersonaTrainer):
    name = "krea-train"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, client=None):
        s = get_settings()
        self.api_key = api_key or s.krea_api_key
        self.base_url = (base_url or s.krea_base_url).rstrip("/")
        self.timeout = max(s.krea_timeout_s, 600.0)  # training is slower than gen
        self._client = client
        if not self.api_key:
            raise StudioError("KREA trainer requires SCS_KREA_API_KEY to be set")

    def _http(self):
        if self._client is not None:
            return self._client
        import httpx

        self._client = httpx.Client(timeout=self.timeout)
        return self._client

    def _headers(self) -> dict:
        # Reuse the generation provider's auth scheme handling.
        return KreaGenerationProvider(api_key=self.api_key, client=self._client)._auth_headers()

    # ---- API shapes (mirror the KREA Train web flow) --------------------
    def _start_payload(self, persona_id: str, asset_ids: list[str], base_model: str, meta: dict) -> dict:
        s = get_settings()
        return {
            "name": meta.get("name") or f"persona-{persona_id}",
            "model": base_model or s.krea_model,            # e.g. "flux"
            "optimize_for": meta.get("optimize_for") or s.krea_optimize_for,  # style|character|object|face
            "modality": meta.get("modality") or s.krea_modality,             # image|video
            "asset_ids": asset_ids,
        }

    @staticmethod
    def _extract_model_ref(body: dict):
        # Only explicit model keys — never the bare job "id", which is the
        # training-job id (used for polling), not the trained model.
        for k in ("model_id", "trained_model_id", "model"):
            if isinstance(body, dict) and body.get(k):
                return str(body[k])
        return None

    @staticmethod
    def _status(body: dict) -> str:
        return str((body or {}).get("status") or (body or {}).get("state") or "").lower()

    # ---- flow ------------------------------------------------------------
    def _upload(self, http, path: str) -> str:
        with open(path, "rb") as fh:
            files = {"file": (path.rsplit("/", 1)[-1], fh, "application/octet-stream")}
            r = http.post(f"{self.base_url}/v1/assets", files=files, headers=self._headers())
        body = self._json(r)
        if r.status_code >= 400:
            raise StudioError(f"KREA asset upload failed ({r.status_code}): {body}")
        asset_id = body.get("id") or body.get("asset_id")
        if not asset_id:
            raise StudioError(f"KREA upload returned no asset id: {body}")
        return str(asset_id)

    def train(self, *, persona_id, image_paths, base_model, meta) -> TrainResult:
        if not image_paths:
            raise StudioError("no reference images to train on")
        http = self._http()

        asset_ids = [self._upload(http, p) for p in image_paths]
        headers = {**self._headers(), "Content-Type": "application/json"}
        start = http.post(
            f"{self.base_url}/v1/trainings",
            json=self._start_payload(str(persona_id), asset_ids, base_model, meta),
            headers=headers,
        )
        body = self._json(start)
        if start.status_code >= 400:
            raise StudioError(f"KREA training start failed ({start.status_code}): {body}")

        model_ref = self._extract_model_ref(body)
        job_id = body.get("id") or body.get("training_id") or body.get("job_id")
        if not model_ref and job_id:
            model_ref = self._poll(http, str(job_id), headers)

        if not model_ref:
            raise StudioError(f"KREA training produced no model id: {body}")
        return TrainResult(model_ref=model_ref, base_model=base_model,
                           meta={"num_images": len(image_paths), "krea_assets": asset_ids, **meta})

    def _poll(self, http, job_id: str, headers: dict) -> str:
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            r = http.get(f"{self.base_url}/v1/trainings/{job_id}", headers=headers)
            body = self._json(r)
            ref = self._extract_model_ref(body)
            status = self._status(body)
            if ref and status in {"", "completed", "succeeded", "ready"}:
                return ref
            if status in {"failed", "error", "canceled", "cancelled"}:
                raise StudioError(f"KREA training {job_id} {status}: {body}")
            time.sleep(5)
        raise StudioError(f"KREA training {job_id} timed out after {self.timeout}s")

    @staticmethod
    def _json(resp) -> dict:
        try:
            return resp.json()
        except Exception:
            return {"raw": getattr(resp, "text", ""), "status_code": getattr(resp, "status_code", None)}
