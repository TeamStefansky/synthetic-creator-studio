"""LoRA training lifecycle: queued → training → ready, versioning, fail-closed."""
from __future__ import annotations

import pytest

from app.generation.lora import LoraRegistry, run_training
from app.models.lora_model import LoraModel


def test_training_job_lifecycle_reaches_ready(session, persona):
    reg = LoraRegistry(session)
    job = reg.create_training_job(
        persona_id=persona.id, base_model="sd-2-1", dataset_uri="s3://ds/persona"
    )
    assert job.status == "queued"
    assert job.version == "v1"

    model = run_training(session, job.id)
    assert model.status == "ready"
    assert model.weights_uri and model.weights_uri.endswith(".safetensors")
    assert model.training_meta.get("stub") is True  # no GPU in this env


def test_versions_increment_per_persona(session, persona):
    reg = LoraRegistry(session)
    v1 = reg.create_training_job(persona_id=persona.id, base_model="m", dataset_uri="d")
    v2 = reg.create_training_job(persona_id=persona.id, base_model="m", dataset_uri="d")
    assert (v1.version, v2.version) == ("v1", "v2")


def test_training_failure_marks_failed_and_raises(session, persona, monkeypatch):
    reg = LoraRegistry(session)
    job = reg.create_training_job(persona_id=persona.id, base_model="m", dataset_uri="d")

    # Force the "real GPU" path and make it blow up.
    import app.generation.lora as lora_mod

    monkeypatch.setattr(lora_mod, "_train_with_diffusers", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    monkeypatch.setattr("app.generation.diffusion_provider.diffusion_available", lambda: True)

    with pytest.raises(RuntimeError):
        run_training(session, job.id)

    refreshed = session.get(LoraModel, job.id)
    assert refreshed.status == "failed"
    assert "boom" in (refreshed.training_meta or {}).get("error", "")


def test_worker_task_runs_training_inline(session, persona):
    job = LoraRegistry(session).create_training_job(
        persona_id=persona.id, base_model="m", dataset_uri="d"
    )
    session.commit()
    from workers.tasks import _train_lora

    status = _train_lora(str(job.id))
    assert status == "ready"
