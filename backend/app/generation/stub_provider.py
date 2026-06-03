"""StubGenerationProvider — deterministic, dependency-light stand-in.

Renders a solid-color placeholder image (or a text blob) so the *entire*
generate → disclose → publish pipeline is exercisable without a GPU. It honors
the persona's stored ``visual_identity`` (e.g. a base color + tags) so the QC
consistency check has something real to compare against.
"""
from __future__ import annotations

import hashlib
import io

from app.generation.provider import GenerationProvider, GenerationRequest, GenerationResult
from app.models.asset import AssetKind

try:
    from PIL import Image

    _PIL_OK = True
except Exception:  # pragma: no cover
    _PIL_OK = False


def _seeded_color(seed_text: str) -> tuple[int, int, int]:
    h = hashlib.sha256(seed_text.encode()).digest()
    return h[0], h[1], h[2]


class StubGenerationProvider(GenerationProvider):
    name = "stub-diffusion-v0"

    def generate(self, request: GenerationRequest) -> GenerationResult:
        if request.kind == AssetKind.TEXT:
            body = f"[persona:{request.persona_id}] {request.prompt}"
            return GenerationResult(kind=AssetKind.TEXT, content=body.encode(), fmt="TXT")

        if not _PIL_OK:  # pragma: no cover
            # 1x1 PNG fallback keeps the pipeline alive without Pillow.
            png = (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
                b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc``\x00\x00"
                b"\x00\x04\x00\x01\xf6\x178U\x00\x00\x00\x00IEND\xaeB`\x82"
            )
            return GenerationResult(kind=AssetKind.IMAGE, content=png, fmt="PNG")

        vi = request.visual_identity or {}
        base = vi.get("base_color")
        color = tuple(base) if isinstance(base, (list, tuple)) and len(base) == 3 else _seeded_color(
            f"{request.persona_id}:{request.lora_version}:{request.seed}"
        )
        img = Image.new("RGB", (request.width, request.height), tuple(color))
        out = io.BytesIO()
        img.save(out, format="PNG")
        return GenerationResult(
            kind=AssetKind.IMAGE,
            content=out.getvalue(),
            fmt="PNG",
            meta={"dominant_color": list(color), "provider": self.name},
        )
