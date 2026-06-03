"""C4 — no impersonation of real people / no presenting persona as human."""
from __future__ import annotations

import pytest

from app.constraints import Constraint, ImpersonationError
from app.generation.service import GenerationService
from app.generation.stub_provider import StubGenerationProvider
from app.safety.real_person import RealPersonGuard, assert_no_real_person
from app.services.personas import create_persona


def test_guard_flags_real_human_claim():
    guard = RealPersonGuard()
    finding = guard.inspect("She is a real person, not an AI")
    assert finding.matched
    assert finding.constraint == Constraint.NO_REAL_PERSON_IMPERSONATION


def test_guard_flags_likeness_intent():
    with pytest.raises(ImpersonationError):
        assert_no_real_person("create a deepfake likeness of a famous actor")


def test_guard_flags_known_public_figure():
    guard = RealPersonGuard(known_public_figures={"Jane Realstar"})
    with pytest.raises(ImpersonationError):
        guard.assert_clear("portrait styled after Jane Realstar")


def test_persona_creation_rejects_real_human_framing(session, entity):
    with pytest.raises(ImpersonationError):
        create_persona(
            session,
            responsible_entity_id=entity.id,
            name="Mia",
            backstory="Mia is a real person, not an AI or bot.",
        )


def test_generation_prompt_rejects_impersonation(session, persona):
    service = GenerationService(session, StubGenerationProvider())
    with pytest.raises(ImpersonationError):
        service.generate_asset(persona_id=persona.id, prompt="impersonate a real politician")


def test_clean_prompt_passes(session, persona):
    service = GenerationService(session, StubGenerationProvider())
    asset = service.generate_asset(persona_id=persona.id, prompt="cheerful studio portrait, soft light")
    assert asset.disclosure_status.value == "tagged"
