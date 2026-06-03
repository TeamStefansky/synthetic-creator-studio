# CONSTRAINTS.md — The Law of Synthetic Creator Studio

These constraints are **non-negotiable**. No module, feature, config flag, or
code path may bypass them. They are enforced **server-side** and referenced
directly by the test suite (`backend/tests/`). If a requested action would
violate any of them, the code path **fails closed** with a clear error — it
never silently proceeds.

The canonical machine-readable identifiers live in
`backend/app/constraints.py` (`Constraint` enum). Tests assert against those
IDs so this document and the code stay in lockstep.

---

## C1 — Disclosure is a core layer, not a feature
Every asset the engine emits carries:
- **Embedded provenance metadata** (C2PA-style Content Credentials manifest), and
- A **visible "AI / synthetic" label** (watermark/badge) baked into the pixels.

Provenance is applied at the moment of emission by `ProvenanceService`. An
asset that has not passed through provenance stamping is `disclosure_status =
pending` and is **not publishable**.

*Enforced by:* `app/disclosure/provenance.py`, `app/disclosure/labeler.py`,
`app/generation/service.py`.

## C2 — No publish without disclosure
The distribution module **refuses** to post any asset lacking valid provenance
+ a visible label. This is a **server-side gate** (`DisclosureGate`), not a
client toggle. `publish()` calls the gate *before* contacting any platform
adapter.

*Enforced by:* `app/disclosure/gate.py`, `app/distribution/service.py`.

## C3 — Every persona maps to a named, accountable entity
No anonymous networks. A `persona` cannot exist without:
- a `responsible_entity` (FK, NOT NULL), and
- a 1:1 `synthetic_identity` record (`ai_generated = true`).

Persona creation is **atomic**: the persona and its `synthetic_identity` are
created in a single transaction, or neither is created.

*Enforced by:* `app/services/personas.py`, DB NOT-NULL + unique constraints.

## C4 — No impersonation of real people
- A persona must never be presented as a real human.
- Inputs/prompts that target a real, named individual's likeness are **rejected**.

*Enforced by:* `app/safety/real_person.py`, applied at persona creation and on
every generation prompt.

## C5 — Platform-compliant distribution only
Official platform APIs only. We respect each platform's synthetic-media policy
and ToS. **No** scraping-based posting, **no** credential sharing, **no**
rate-limit evasion. Each platform adapter declares the synthetic-media policy
it satisfies; publishing checks it.

*Enforced by:* `app/distribution/adapters.py`, `app/distribution/policy.py`.

## C6 — Fail closed
If an action would violate C1–C5, raise a `ConstraintViolation` (subclass of
`StudioError`) with the offending constraint ID and a clear message. Never
degrade silently, never "best-effort" publish.

*Enforced by:* `app/constraints.py` (exceptions), exercised across the suite.

---

## Test mapping (Build Brief §6)
| Requirement | Test |
|---|---|
| Persona cannot be created without `synthetic_identity` | `test_persona_requires_synthetic_identity.py` |
| `DisclosureGate` blocks an untagged asset | `test_disclosure_gate.py` |
| generate → provenance embedded → publish gate passes only when tagged | `test_generation_provenance_integration.py` |
| Publish with missing/invalid manifest fails closed | `test_publish_fails_closed.py` |
| Real-person impersonation rejected (C4) | `test_real_person_guard.py` |
