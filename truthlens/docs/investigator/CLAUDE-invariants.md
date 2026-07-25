# TruthLens Investigator — cross-cutting invariants

These hold across every layer and every phase. A later phase may add to them and may never relax
one. If a requirement seems to need an exception, the requirement is wrong — stop and report it.

Append the block at the bottom of this file to `CLAUDE.md` so it is loaded in every session.

---

## Evidence

1. **Evidence is append-only.** Records transition state (`live → archived-only → lost → superseded`)
   and are never deleted. Corrections are new records with the supersession recorded.
2. **Every evidence record carries a content hash** of the retrieved bytes plus its acquisition
   method. A source URL is not provenance.
3. **A gap is not negative evidence.** Absence counts against a hypothesis only when a hypothesis
   predicted the artifact, the search was capable of finding it, and coverage was complete. Otherwise
   it is a gap and scores zero in both directions. These are two distinct types, never one flag.
4. **Two sources are one source if their lineage is one.** Syndicated, mirrored, and registry-mirror
   content collapses to a single corroboration weight.

## Time

5. **Timestamp tiers govern sequence.** A directional claim requires both endpoints at T2 or better,
   with a gap exceeding both the tier tolerance and clock skew. Otherwise: `order not established`,
   rendered explicitly, never silently dropped.
6. **T4 is an upper bound only.** "When we first saw it" never proves a thing did not exist earlier.
7. **Never write "origin", "source of", "first", or "patient zero".** Write "earliest observed in
   collected data". The difference is between a claim about the world and a claim about our collection.

## Strength

8. **Class characteristics never individualize.** Any quantity of shared class features narrows a
   population and cannot identify. The `common-operation` rung requires at least one individual
   characteristic. An artifact type with an unknown base rate is class by default.
9. **A conclusion is as strong as its weakest load-bearing link** — minimum over bridging evidence,
   never a maximum, sum, or average.
10. **Weak edges never form or join a cluster.**
11. **Shared processing is not shared behavior.** Subtract the toolchain's processing baseline before
    any signature feature contributes strength.

## Judgment

12. **Likelihood and confidence are separate fields**, separately rendered. Never collapsed.
13. **Every generated statement carries a label** (FACT / INFERENCE / ASSUMPTION / SPECULATION) and
    at least one valid evidence ID. Statements failing validation are dropped and the drop count is
    shown to the user, never hidden.
14. **Language may not exceed the recorded rung** (association / common-operation / attribution).
    Verbs of agency are attribution-rung only.
15. **Every conclusion has a non-empty falsification list.** A finding nothing could disprove is a
    belief.
16. **The hypothesis set always contains the null and the deception hypothesis**, generated before
    deep collection, scored by fewest inconsistencies. A close top two is `undetermined`.
17. **Deception requires positive MOM-POP indicators** to outrank a simpler hypothesis. Otherwise it
    is unfalsifiable and absorbs everything.
18. **Confidence cannot rise from re-reasoning.** Identical evidence and identical versions must
    produce identical numbers.

## The agent

19. **Authority ceiling:** autonomous to `association`; `common-operation` is a proposal requiring
    approval; `attribution` is unreachable under any input.
20. **No scope expansion.** Discovered entities go to the candidate queue and touch nothing until an
    analyst accepts them.
21. **Read-only in the world.** No contact, submission, authentication, or action against any domain
    or account. No configuration enables it.
22. **A partial-coverage run may add findings and may never retract one**, and never emits a
    regression alert. Our incompleteness is not a change in the world.
23. **The dissent function has a reserved budget, a veto, and cannot be truncated or skipped** — it
    runs on halted and partial runs too.
24. **No conclusion crosses cases as evidence.** Evidence may be reused with its own provenance;
    conclusions never.
25. **"No case established" is a successful run** and produces no alert.

## Always

26. **No person nodes, named individuals, or account-holder identities** anywhere — case,
    reconstruction, journal, audience analysis, or export.
27. **Every threshold is a named export**, versioned, and stamped onto the artifact it produced.
28. **Anything that determines a score, rank, direction, or confidence is computed in TypeScript**
    and reproducible without the model.
29. **Every export carries its gaps register and falsification list.** An export omitting them is a
    defect.
30. **Excluded by requirement, not omission:** HUMINT tradecraft, surveillance or covert access,
    targeting cycles, person-level behavioral profiling, polygraph-adjacent statement scoring.

---

## Block to append to `CLAUDE.md`

```md
## Investigator layers — non-negotiable invariants

Full list: `docs/investigator/CLAUDE-invariants.md`. Read it before any work under `lib/case/*`,
`lib/agent/*`, or `lib/board/calibrate.ts`. Summary of what may never be weakened:

- Evidence is append-only and content-hashed. A gap is not negative evidence.
- Direction requires T2+ at both ends; otherwise `order not established`. T4 is an upper bound only.
- Class characteristics never individualize. Weak edges never form clusters. Confidence is the
  minimum over load-bearing evidence.
- Likelihood and confidence are separate. Every statement is labeled and cited. Language may not
  exceed its recorded rung. Every conclusion has a falsification list.
- The hypothesis set always includes the null and the deception hypothesis.
- The agent is autonomous only to `association`, never expands scope, never acts in the world, and a
  partial-coverage run never retracts.
- No person nodes anywhere. Every threshold is a named export. Scores are computed in TypeScript,
  never by the model.

If a task appears to require an exception, stop and report the conflict rather than working around it.
```


