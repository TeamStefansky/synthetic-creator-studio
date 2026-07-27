"""Deterministic 200-document corpus + monitoring watchlist for the regression gate.

Shared by the golden-file generator (``scripts``-style one-off) and the
byte-for-byte regression test so both build the exact same inputs.
"""

from __future__ import annotations

from newsradar.connectors.base import QueryTerm

# A monitoring watchlist exercising keywords, phrases, booleans, exclusions and
# per-language scoping (English + Hebrew).
MONITORING_TERMS: list[QueryTerm] = [
    QueryTerm(text="cybersecurity", term_type="keyword", weight=1.0),
    QueryTerm(text="quantum computing", term_type="phrase", weight=2.0),
    QueryTerm(text="Israel AND (cyber OR defense)", term_type="boolean", weight=1.5),
    QueryTerm(text='"iron dome"', term_type="boolean", weight=1.0),
    QueryTerm(text="בינה מלאכותית", term_type="phrase", lang="he", weight=1.0),
    QueryTerm(text="סייבר", term_type="keyword", lang="he", weight=1.0),
    QueryTerm(text="sponsored", is_exclusion=True),
]

_EN_SUBJECTS = [
    "A cybersecurity firm",
    "A quantum computing lab",
    "The Israel defense ministry",
    "An iron dome battery",
    "A local bakery",
    "The transport authority",
    "A cyber startup in Israel",
    "A sports club",
]
_EN_PREDICATES = [
    "announced new funding today.",
    "published a research paper.",
    "was involved in a minor incident.",
    "expanded operations overseas.",
    "sponsored a community event.",
    "held a press conference.",
]
_HE_SUBJECTS = [
    "מיזם בינה מלאכותית",
    "חברת סייבר",
    "רשות התחבורה",
    "מסעדה מקומית",
]
_HE_PREDICATES = [
    "הכריז על גיוס הון.",
    "פרסם מחקר חדש.",
    "קיים מסיבת עיתונאים.",
]


def build_corpus(n: int = 200) -> list[dict[str, str | None]]:
    """Build ``n`` deterministic documents (no randomness, stable across runs)."""

    docs: list[dict[str, str | None]] = []
    for i in range(n):
        if i % 3 == 0:
            subj = _HE_SUBJECTS[i % len(_HE_SUBJECTS)]
            pred = _HE_PREDICATES[i % len(_HE_PREDICATES)]
            title = f"{subj} {pred}"
            body = f"{subj} {pred} פרטים נוספים בהמשך הכתבה מספר {i}."
            lang: str | None = "he"
        else:
            subj = _EN_SUBJECTS[i % len(_EN_SUBJECTS)]
            pred = _EN_PREDICATES[i % len(_EN_PREDICATES)]
            title = f"{subj} {pred}"
            body = f"{subj} {pred} Further details follow in story number {i}."
            lang = "en" if i % 2 == 0 else None
        docs.append({"title": title, "body": body, "lang": lang})
    return docs


def match_text(doc: dict[str, str | None]) -> str:
    return "\n".join(p for p in (doc["title"], doc["body"]) if p)
