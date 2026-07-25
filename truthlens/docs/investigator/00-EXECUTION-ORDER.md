# Execution order

Six layers. Each consumes the version stamps and machinery of the ones before it, so the order is a
dependency, not a preference. Run each in its own Claude Code session — the context needed for a
layer is large, and a session carrying three layers of history makes worse decisions than a fresh one
reading the files.

| # | File | Adds | Depends on |
|---|---|---|---|
| 01 | `01-link-board.md` *(supply your own copy)* | Pairwise entity links, the strength rubric, `BOARD_RUBRIC_VERSION` | — |
| 02 | `02-infra-extension.md` *(supply your own copy)* | Server/infrastructure comparison, CDN and mass-host down-weighting | 01 |
| 03 | `03-case-synthesis-v2.md` | Evidence ledger, chain of custody, time tiers, source grading, clusters, propagation path, reconstruction, ACH, negative evidence, gaps | 01, 02 |
| 04 | `04-case-monitoring.md` | Shape hash, materiality tiers, indicators, stability gating, coverage-safe scheduling, evidence decay, review state | 03 |
| 05 | `05-investigator-agent.md` | THE INVESTIGATOR: authority ceiling, budget, planning, run loop, standing dissent, journal, situation report | 03, 04 |
| 06 | `06-investigator-tradecraft.md` | Collection doctrine, class/individual characteristics, examination discipline, measured error rate, signature vs MO, processing baseline, conception monitor, pluralism | 05 |

Layers 01 and 02 came from an earlier session and are not reproduced here. Drop your copies into this
directory under those filenames before starting 03 — the `/phase` command checks for them.

## Running a phase

```
/phase docs/investigator/03-case-synthesis-v2.md P0
```

Then, before approving:

```
/gate docs/investigator/03-case-synthesis-v2.md P0
```

Run `/gate` in a **separate session** where you can. A reviewer that just wrote the code is not a
reviewer, and the whole chain is built around that principle — applying it to the build process is
consistent rather than precious.

## Session plan

Each row is one session. Do not carry two layers in one context.

| Session | Phases | Notes |
|---|---|---|
| 1 | 03 · P0–P2 | P0 is discovery only, no production edits. Read the P1 diff yourself — it defines the ledger schema everything later depends on. |
| 2 | 03 · P3–P5 | |
| 3 | 03 · P6–P7 | P6 is the validator. If it is lenient, the whole layer reverts to a conspiracy wall with good typography. Read its adversarial fixtures line by line. |
| 4 | 04 · P0–P3 | P3 is the budget and coverage guard. This is the phase an agent most wants to simplify, because letting a partial run behave normally is less code. Verify the starved-budget fixture retracts nothing. |
| 5 | 04 · P4–P5 | |
| 6 | 05 · P0–P1 | **Read this diff manually.** P1 is the cage: authority, scope lock, budget, kill switch. Every later phase can quietly widen a limit set here, and if this is wrong nothing else matters. |
| 7 | 05 · P2–P4 | P4 is the adversarial pass. Check its budget is genuinely reserved. |
| 8 | 05 · P5–P6 | |
| 9 | 06 · P0–P2 | **Land P2 before anything behavioral.** It is the error-rate harness; without it every later change is judged by eye, which is how a system improves in feel and degrades in measurement. |
| 10 | 06 · P3–P5 | P5 pairs signature scoring with the processing baseline. They ship together or the layer manufactures links at scale. |
| 11 | 06 · P6–P7 | |

## The three diffs to read yourself

Everything else can be reviewed with `/gate`. These three decide whether the system is honest:

1. **05 · P1** — the authority cage. Later phases erode it silently and plausibly.
2. **03 · P6** — the citation and rung validator. Leniency here is invisible and total.
3. **06 · P5** — the processing baseline. Without it, "signature matching" produces confident,
   technical-looking false positives at volume.

## Stop conditions

Stop the session and reassess if the agent proposes any of these, all of which are reasonable-sounding
and all of which break the chain:

- adding a runtime dependency or an external data source;
- making an authority ceiling, a rung, or an ethics test configurable;
- merging the gaps register with negative evidence "to simplify";
- letting the model produce a score, a rank, or a confidence value;
- skipping the dissent pass "because the case is clear";
- allowing a partial-coverage run to retract a finding.


