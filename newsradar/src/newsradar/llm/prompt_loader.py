"""Load Markdown prompt templates bundled under ``newsradar/llm/prompts/``."""

from __future__ import annotations

from functools import cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


@cache
def load_prompt(name: str) -> str:
    """Return the text of a bundled prompt template (e.g. ``"stance.md"``)."""

    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")
