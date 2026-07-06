"""AI provider interface. Any implementation (rule-based, Anthropic, local model)
exposes the same methods, so the analysis pipeline never depends on a vendor."""
from __future__ import annotations

from abc import ABC, abstractmethod


class AiProvider(ABC):
    name: str = "base"

    @abstractmethod
    def language(self, text: str) -> str:
        """ISO-639-1 code, best-effort."""

    @abstractmethod
    def sentiment(self, text: str) -> float:
        """Polarity in [-1, 1]."""

    @abstractmethod
    def keywords(self, text: str, top: int = 5) -> list[str]:
        """Salient content words."""

    @abstractmethod
    def summarize(self, texts: list[str], context: str = "") -> str:
        """One-paragraph summary of a set of texts."""
