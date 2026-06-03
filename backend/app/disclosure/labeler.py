"""VisibleLabeler — bakes a visible "AI / SYNTHETIC" badge into emitted media (C1).

For images this draws a high-contrast badge in the corner using Pillow. For
video the same badge would be burned across frames (ffmpeg drawtext) — wired as
an interface method here. For text assets the label is prepended.

Pillow is a declared dependency; if it is somehow unavailable the labeler
*fails closed* rather than emitting an unlabeled image, preserving C1.
"""
from __future__ import annotations

import io

from app.config import get_settings
from app.constraints import Constraint, DisclosureError

try:  # Pillow is in requirements.txt; import guarded for clear failure.
    from PIL import Image, ImageDraw, ImageFont

    _PIL_OK = True
except Exception:  # pragma: no cover - environment without Pillow
    _PIL_OK = False


class VisibleLabeler:
    def __init__(self, label_text: str | None = None):
        # Stored as ``label`` to avoid colliding with the ``label_text`` method.
        self.label = label_text or get_settings().disclosure_label_text

    def label_text_value(self) -> str:
        """The visible label string baked into assets."""
        return self.label

    # ---- images ----------------------------------------------------------
    def label_image_bytes(self, data: bytes, *, fmt: str = "PNG") -> bytes:
        if not _PIL_OK:
            raise DisclosureError(
                Constraint.DISCLOSURE_IS_CORE,
                "image labeler unavailable (Pillow missing) — refusing to emit an unlabeled asset",
            )
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        overlay = self._badge_overlay(img.size)
        composited = Image.alpha_composite(img, overlay)
        out = io.BytesIO()
        if fmt.upper() in {"JPG", "JPEG"}:
            composited.convert("RGB").save(out, format="JPEG", quality=92)
        else:
            composited.save(out, format="PNG")
        return out.getvalue()

    def _badge_overlay(self, size: tuple[int, int]):
        w, h = size
        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        text = self.label
        font = self._load_font(max(12, w // 28))
        tw, th = self._text_size(draw, text, font)
        pad = max(6, w // 100)
        # Bottom-left pill.
        x0, y0 = pad, h - th - 3 * pad
        x1, y1 = x0 + tw + 2 * pad, y0 + th + 2 * pad
        draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0, 180))
        draw.text((x0 + pad, y0 + pad), text, fill=(255, 255, 255, 255), font=font)
        return overlay

    @staticmethod
    def _load_font(px: int):
        try:
            return ImageFont.truetype("DejaVuSans-Bold.ttf", px)
        except Exception:
            return ImageFont.load_default()

    @staticmethod
    def _text_size(draw, text, font) -> tuple[int, int]:
        try:
            l, t, r, b = draw.textbbox((0, 0), text, font=font)
            return r - l, b - t
        except Exception:  # very old Pillow
            return draw.textsize(text, font=font)

    # ---- text ------------------------------------------------------------
    def label_text(self, body: str) -> str:
        prefix = f"[{self.label}] "
        return body if body.startswith(prefix) else prefix + body

    # ---- video (interface) ----------------------------------------------
    def label_video(self, src_uri: str, dst_uri: str) -> str:  # pragma: no cover - needs ffmpeg
        """Burn the badge across all frames. Stub: real impl shells to ffmpeg
        drawtext. Fails closed if not implemented in a given deployment."""
        raise DisclosureError(
            Constraint.DISCLOSURE_IS_CORE,
            "video labeling backend not configured — refusing to emit unlabeled video",
        )
