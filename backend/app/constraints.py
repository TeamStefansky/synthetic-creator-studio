"""The Law — machine-readable constraint identifiers + fail-closed exceptions.

This module is the code-side anchor of CONSTRAINTS.md. Tests assert against the
``Constraint`` enum so the document and the code cannot drift apart silently.

Constraint 6 ("fail closed") is realized by raising ``ConstraintViolation``
(never returning a soft/degraded result) whenever C1–C5 would be breached.
"""
from __future__ import annotations

from enum import Enum


class Constraint(str, Enum):
    """Stable IDs for the six non-negotiable constraints (see CONSTRAINTS.md)."""

    DISCLOSURE_IS_CORE = "C1_DISCLOSURE_IS_CORE"
    NO_PUBLISH_WITHOUT_DISCLOSURE = "C2_NO_PUBLISH_WITHOUT_DISCLOSURE"
    ACCOUNTABLE_ENTITY_REQUIRED = "C3_ACCOUNTABLE_ENTITY_REQUIRED"
    NO_REAL_PERSON_IMPERSONATION = "C4_NO_REAL_PERSON_IMPERSONATION"
    PLATFORM_COMPLIANT_ONLY = "C5_PLATFORM_COMPLIANT_ONLY"
    FAIL_CLOSED = "C6_FAIL_CLOSED"

    @property
    def title(self) -> str:
        return {
            Constraint.DISCLOSURE_IS_CORE: "Disclosure is a core layer, not a feature",
            Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE: "No publish without disclosure",
            Constraint.ACCOUNTABLE_ENTITY_REQUIRED: "Every persona maps to a named, accountable entity",
            Constraint.NO_REAL_PERSON_IMPERSONATION: "No impersonation of real people",
            Constraint.PLATFORM_COMPLIANT_ONLY: "Platform-compliant distribution only",
            Constraint.FAIL_CLOSED: "Fail closed on violation",
        }[self]


class StudioError(Exception):
    """Base class for all domain errors in the studio."""


class ConstraintViolation(StudioError):
    """Raised when an action would breach the Law (C1–C5). Always fail closed.

    Carries the offending :class:`Constraint` so callers/tests can react
    precisely instead of string-matching messages.
    """

    def __init__(self, constraint: Constraint, message: str):
        self.constraint = constraint
        self.message = message
        super().__init__(f"[{constraint.value}] {constraint.title}: {message}")


class DisclosureError(ConstraintViolation):
    """A disclosure/provenance breach (C1/C2)."""


class ImpersonationError(ConstraintViolation):
    """A real-person impersonation breach (C4)."""


class PlatformPolicyError(ConstraintViolation):
    """A platform synthetic-media policy / ToS breach (C5)."""
