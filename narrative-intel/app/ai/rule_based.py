"""Deterministic rule-based AI provider (default). No network, no cost."""
from __future__ import annotations

import re
from collections import Counter

from .base import AiProvider

_WORD = re.compile(r"[a-z0-9]+")

_STOP = set(
    "the a an and or but of to in on for with at by from is are was were be been being "
    "this that these those it its they them their you your we our i he she his her as not "
    "will would can could should may might do does did have has had about into over under "
    "they're don't want know your you the new".split()
)

_POS = set("good great positive win success confirm official effective safe true support help improve".split())
_NEG = set("bad terrible destroy fake lie hoax scam danger threat crisis fear corrupt fraud attack collapse".split())

_HEBREW = re.compile(r"[֐-׿]")
_ARABIC = re.compile(r"[؀-ۿ]")


class RuleBasedProvider(AiProvider):
    name = "rule_based"

    def language(self, text: str) -> str:
        if _HEBREW.search(text):
            return "he"
        if _ARABIC.search(text):
            return "ar"
        return "en"

    def sentiment(self, text: str) -> float:
        words = _WORD.findall(text.lower())
        pos = sum(w in _POS for w in words)
        neg = sum(w in _NEG for w in words)
        if pos == 0 and neg == 0:
            return 0.0
        return round((pos - neg) / (pos + neg), 3)

    def keywords(self, text: str, top: int = 5) -> list[str]:
        words = [w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 2]
        return [w for w, _ in Counter(words).most_common(top)]

    def summarize(self, texts: list[str], context: str = "") -> str:
        if not texts:
            return "No content."
        kw = Counter()
        for t in texts:
            kw.update(self.keywords(t, top=6))
        top = ", ".join(w for w, _ in kw.most_common(6))
        return (f"{context + ' ' if context else ''}{len(texts)} posts centred on: {top}. "
                f"Representative: \"{texts[0][:140]}\"")
