"""DiffusionGenerationProvider — real per-character diffusion + LoRA (Milestone 3).

Implements the ``GenerationProvider`` interface using the Hugging Face
``diffusers`` Stable Diffusion pipeline with a per-persona LoRA adapter. This is
the production path; it requires ``torch`` + ``diffusers`` and (realistically) a
GPU, which are not present in the build sandbox — so importing the heavy deps is
lazy and a clear, fail-closed error is raised if they are unavailable.

The provider deliberately produces only *raw* bytes; visible labeling and
provenance stamping remain the responsibility of ``GenerationService`` so C1
cannot be bypassed by swapping the model in here.
"""
from __future__ import annotations

import io

from app.constraints import StudioError
from app.generation.provider import GenerationProvider, GenerationRequest, GenerationResult
from app.models.asset import AssetKind


def diffusion_available() -> bool:
    try:
        import diffusers  # noqa: F401
        import torch  # noqa: F401

        return True
    except Exception:
        return False


class DiffusionGenerationProvider(GenerationProvider):
    name = "diffusion-sd-lora"

    def __init__(
        self,
        *,
        base_model: str = "stabilityai/stable-diffusion-2-1",
        device: str | None = None,
        lora_weights_resolver=None,
    ):
        self.base_model = base_model
        self.device = device
        # Callable(persona_id, lora_version) -> local path / hub id of the adapter.
        self._resolve_lora = lora_weights_resolver
        self._pipeline = None  # lazily constructed

    # ---- pipeline lifecycle ---------------------------------------------
    def _ensure_pipeline(self):
        if self._pipeline is not None:
            return self._pipeline
        if not diffusion_available():
            raise StudioError(
                "DiffusionGenerationProvider requires 'torch' + 'diffusers' (and a GPU). "
                "They are not installed in this environment — install them or use the "
                "stub provider. The studio falls back to the stub when configured."
            )
        import torch  # type: ignore
        from diffusers import StableDiffusionPipeline  # type: ignore

        device = self.device or ("cuda" if torch.cuda.is_available() else "cpu")
        dtype = torch.float16 if device == "cuda" else torch.float32
        pipe = StableDiffusionPipeline.from_pretrained(self.base_model, torch_dtype=dtype)
        pipe = pipe.to(device)
        self.device = device
        self._pipeline = pipe
        return pipe

    def _apply_lora(self, pipe, request: GenerationRequest) -> None:
        if not request.lora_version or self._resolve_lora is None:
            return
        weights = self._resolve_lora(request.persona_id, request.lora_version)
        if weights:
            # diffusers LoRA loading — per-character adapter for visual identity.
            pipe.load_lora_weights(weights)

    # ---- generation ------------------------------------------------------
    def generate(self, request: GenerationRequest) -> GenerationResult:
        if request.kind != AssetKind.IMAGE:
            raise StudioError("DiffusionGenerationProvider only generates images")

        # Raises a clear, fail-closed StudioError if torch/diffusers are missing.
        pipe = self._ensure_pipeline()
        import torch  # type: ignore

        self._apply_lora(pipe, request)

        generator = None
        if request.seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(request.seed)

        # Bias the prompt toward the persona's stored visual identity for consistency.
        vi = request.visual_identity or {}
        style = ", ".join(vi.get("tags", [])) if isinstance(vi.get("tags"), list) else ""
        prompt = f"{request.prompt}, {style}".strip(", ")

        image = pipe(
            prompt=prompt,
            negative_prompt=request.negative_prompt,
            width=request.width,
            height=request.height,
            generator=generator,
        ).images[0]

        out = io.BytesIO()
        image.save(out, format="PNG")
        return GenerationResult(
            kind=AssetKind.IMAGE,
            content=out.getvalue(),
            fmt="PNG",
            meta={"provider": self.name, "base_model": self.base_model, "device": self.device},
        )
