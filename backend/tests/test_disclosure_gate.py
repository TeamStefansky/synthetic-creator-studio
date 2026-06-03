"""C2 — DisclosureGate blocks an untagged asset (Build Brief §6)."""
from __future__ import annotations

import pytest

from app.constraints import Constraint, DisclosureError
from app.disclosure.gate import DisclosureGate
from app.models.asset import Asset, AssetKind, DisclosureStatus


def test_gate_blocks_pending_asset(session, persona):
    asset = Asset(persona_id=persona.id, kind=AssetKind.IMAGE, disclosure_status=DisclosureStatus.PENDING)
    session.add(asset)
    session.flush()

    gate = DisclosureGate()
    assert gate.is_publishable(asset) is False
    with pytest.raises(DisclosureError) as ei:
        gate.assert_publishable(asset)
    assert ei.value.constraint == Constraint.NO_PUBLISH_WITHOUT_DISCLOSURE


def test_gate_blocks_blocked_asset(session, persona):
    asset = Asset(persona_id=persona.id, kind=AssetKind.IMAGE, disclosure_status=DisclosureStatus.BLOCKED)
    session.add(asset)
    session.flush()
    with pytest.raises(DisclosureError):
        DisclosureGate().assert_publishable(asset)


def test_gate_blocks_tagged_status_without_manifest(session, persona):
    """A forged status flag with no manifest must still fail (defense in depth)."""
    asset = Asset(persona_id=persona.id, kind=AssetKind.IMAGE, disclosure_status=DisclosureStatus.TAGGED)
    session.add(asset)
    session.flush()
    with pytest.raises(DisclosureError):
        DisclosureGate().assert_publishable(asset)
