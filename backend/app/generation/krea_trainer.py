"""KreaPersonaTrainer — train a custom style (LoRA) via KREA's real API.

Per docs.krea.ai: POST /styles/train with
  {name, model, type, urls:[image URLs]}  → {job_id, status}
Training runs for a few minutes; poll GET /jobs/{id} until completed, then the
trained style id is in the job's result. The style id is later applied to
generation via the `styles` list (KreaGenerationProvider).

KREA fetches the reference images from the `urls` we pass — these are public
URLs served by this backend (see SCS_PUBLIC_BASE_URL + the /training-images/{id}/file
endpoint), so no separate asset upload is needed.

This trainer is non-blocking: ``train`` starts the job and returns a pending
result with the job id; ``resolve`` polls once and returns the style id when
ready (called from GET /lora/{id}).
"""
from __future__ import annotations

from app.config import get_settings
from app.constraints import StudioError
from app.generation.trainer import PersonaTrainer, TrainResult

# Our optimize_for → KREA training "type".
_TYPE_MAP = {"style": "Style", "object": "Object", "character": "Character", "default": "Default"}


class KreaPersonaTrainer(PersonaTrainer):
    name = "krea-train"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None, client=None):
        s = get_settings()
        self.api_key = api_key or s.krea_api_key
        self.base_url = (base_url or s.krea_base_url).rstrip("/")
        self.train_model = s.krea_train_model
        self.timeout = s.krea_timeout_s
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
        return {"Authorization": f"Bearer {self.api_key}"}

    @staticmethod
    def _first(d, *keys):
        for k in keys:
            if isinstance(d, dict) and d.get(k) is not None:
                return d[k]
        return None

    # ``image_paths`` are public URLs KREA can fetch (built by the service).
    def train(self, *, persona_id, image_paths, base_model, meta) -> TrainResult:
        if not image_paths:
            raise StudioError("no reference images to train on")
        payload = {
            "name": meta.get("name") or f"persona-{persona_id}",
            "model": meta.get("train_model") or base_model or self.train_model,
            "type": _TYPE_MAP.get(str(meta.get("optimize_for", "style")).lower(), "Style"),
            "urls": list(image_paths),
        }
        if meta.get("trigger_word"):
            payload["trigger_word"] = meta["trigger_word"]

        r = self._http().post(
            f"{self.base_url}/styles/train",
            json=payload,
            headers={**self._headers(), "Content-Type": "application/json"},
        )
        body = self._json(r)
        if r.status_code >= 400:
            raise StudioError(f"KREA training failed ({r.status_code}): {body}")
        job_id = self._first(body, "job_id", "id")
        if not job_id:
            raise StudioError(f"KREA training returned no job_id: {body}")

        # Non-blocking: the style id is resolved later via resolve().
        return TrainResult(
            model_ref="", base_model=payload["model"], pending=True, job_id=str(job_id),
            meta={"krea_job_id": str(job_id), "num_images": len(image_paths), "model": payload["model"]},
        )

    def resolve(self, job_id: str) -> tuple[str, str | None]:
        """Poll the training job once. Returns (status, style_id|None)."""
        r = self._http().get(f"{self.base_url}/jobs/{job_id}", headers=self._headers())
        body = self._json(r)
        status = str(self._first(body, "status", "state") or "").lower()
        result = body.get("result") or {}
        style_id = self._first(result, "style_id", "id", "lora_id")
        if not style_id and isinstance(result.get("style"), dict):
            style_id = self._first(result["style"], "id")
        if style_id and status in {"", "completed", "succeeded", "ready"}:
            return "ready", str(style_id)
        if status in {"failed", "error", "cancelled", "canceled"}:
            return "failed", None
        return "training", None

    @staticmethod
    def _json(resp) -> dict:
        try:
            return resp.json()
        except Exception:
            return {"raw": getattr(resp, "text", ""), "status_code": getattr(resp, "status_code", None)}
