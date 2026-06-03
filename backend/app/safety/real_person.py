"""C4 — reject inputs that target a real, named individual's likeness, or that
present the persona as a real human.

This is a *guardrail*, deliberately conservative and explainable. In production
it would be backed by a likeness/celebrity classifier + named-entity resolution
against a public-figure index; here it is a transparent rule engine so the
behavior is testable and auditable. It is wired into:
  - persona creation (``app/services/personas.py``), and
  - every generation prompt (``app/generation/service.py``).

Fail-closed (C6): on a match it raises ``ImpersonationError``; it never strips
the offending content and proceeds.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.constraints import Constraint, ImpersonationError

# Phrases that assert the persona is a real, non-synthetic human.
_REAL_HUMAN_CLAIMS = [
    r"\breal (?:person|human|woman|man|girl|guy)\b",
    r"\bnot (?:an? )?(?:ai|bot|synthetic|cgi|virtual)\b",
    r"\b100% real\b",
    r"\bactually human\b",
    r"\bpretend(?:ing)? to be (?:a )?real\b",
]

# Intent to reproduce a specific real individual's likeness/identity.
_LIKENESS_INTENT = [
    r"\blikeness of\b",
    r"\bdeepfake\b",
    r"\bface[- ]?swap\b",
    r"\bimpersonat(?:e|ing|ion)\b",
    r"\blook(?:s)? exactly like\b",
    r"\bclone of\b",
    r"\bphoto of\b.*\b(celebrity|politician|actor|actress|singer)\b",
]


@dataclass
class GuardFinding:
    matched: bool
    constraint: Constraint = Constraint.NO_REAL_PERSON_IMPERSONATION
    reasons: list[str] = field(default_factory=list)


class RealPersonGuard:
    """Conservative, explainable guard for C4.

    Parameters
    ----------
    known_public_figures:
        Optional set of names treated as off-limits real individuals. In prod
        this is a maintained index; tests can inject a small set.
    """

    def __init__(self, known_public_figures: set[str] | None = None):
        self._figures = {n.lower() for n in (known_public_figures or set())}
        self._claim_res = [re.compile(p, re.IGNORECASE) for p in _REAL_HUMAN_CLAIMS]
        self._likeness_res = [re.compile(p, re.IGNORECASE) for p in _LIKENESS_INTENT]

    def inspect(self, *texts: str | None) -> GuardFinding:
        blob = " \n ".join(t for t in texts if t).strip()
        finding = GuardFinding(matched=False)
        if not blob:
            return finding

        low = blob.lower()
        for rx in self._claim_res:
            if rx.search(blob):
                finding.reasons.append(f"asserts persona is a real human: /{rx.pattern}/")
        for rx in self._likeness_res:
            if rx.search(blob):
                finding.reasons.append(f"targets a specific real likeness: /{rx.pattern}/")
        for name in self._figures:
            if name and name in low:
                finding.reasons.append(f"references known real individual: '{name}'")

        finding.matched = bool(finding.reasons)
        return finding

    def assert_clear(self, *texts: str | None, context: str = "input") -> None:
        finding = self.inspect(*texts)
        if finding.matched:
            raise ImpersonationError(
                finding.constraint,
                f"{context} rejected — it would impersonate a real person or "
                f"present the persona as human. Findings: {'; '.join(finding.reasons)}",
            )


_DEFAULT_GUARD = RealPersonGuard()


def assert_no_real_person(*texts: str | None, context: str = "input") -> None:
    """Module-level convenience using the default guard."""
    _DEFAULT_GUARD.assert_clear(*texts, context=context)
