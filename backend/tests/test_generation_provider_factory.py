"""Provider factory: diffusion in prod, honest fallback/fail-closed otherwise."""
from __future__ import annotations

import pytest

from app.constraints import StudioError
from app.generation.diffusion_provider import DiffusionGenerationProvider, diffusion_available
from app.generation.factory import get_provider
from app.generation.provider import GenerationRequest
from app.generation.stub_provider import StubGenerationProvider
from app.models.asset import AssetKind


def test_factory_defaults_to_stub():
    assert isinstance(get_provider("stub"), StubGenerationProvider)


def test_factory_diffusion_falls_back_to_stub_when_unavailable():
    provider = get_provider("diffusion", allow_fallback=True)
    if diffusion_available():
        assert isinstance(provider, DiffusionGenerationProvider)
    else:
        assert isinstance(provider, StubGenerationProvider)


@pytest.mark.skipif(diffusion_available(), reason="torch/diffusers present")
def test_factory_diffusion_fails_closed_without_fallback():
    with pytest.raises(StudioError):
        get_provider("diffusion", allow_fallback=False)


@pytest.mark.skipif(diffusion_available(), reason="torch/diffusers present")
def test_diffusion_provider_reports_unavailable_clearly():
    provider = DiffusionGenerationProvider()
    with pytest.raises(StudioError) as ei:
        provider.generate(GenerationRequest(persona_id="p", prompt="x", kind=AssetKind.IMAGE))
    assert "diffusers" in str(ei.value)
