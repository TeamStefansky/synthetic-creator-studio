---
description: Run one implementation phase of a TruthLens investigator task, stopping at its gate
argument-hint: <task-file> <phase>   e.g. docs/investigator/03-case-synthesis-v2.md P1
---

Run exactly one phase. Arguments: $ARGUMENTS

## Before writing any code

1. Read `CLAUDE.md` and `docs/investigator/CLAUDE-invariants.md`. The invariants are cross-cutting
   and every phase must satisfy them, not only the phase that introduced them.
2. Read the task file named in the arguments **in full**, including the framing block at the top.
   That block is not preamble — it states the failure mode the task exists to prevent, and the
   requirements only make sense against it.
3. Read `docs/investigator/00-EXECUTION-ORDER.md` and confirm every prerequisite layer is landed.
   If a prerequisite is missing, stop and say so rather than working around it.
4. Load the `forensic-intelligence-analyst` skill and read the reference files relevant to this
   phase. When a phase touches discriminating power, comparison, collection planning, or review
   design, `references/investigative-methods.md` is required reading, not optional.
5. Read the code the phase modifies before proposing changes to it.

## While implementing

- Implement **only** the phase named in the arguments. Do not start the next one, do not
  "while I'm here" adjacent files.
- Every threshold, weight, tolerance, floor, and lexicon entry is a **named export** in the module
  that owns it. No inline literals. No magic numbers.
- Anything that determines a score, a rank, a confidence, or a direction is computed in TypeScript
  and reproducible without the model. The model generates prose, never numbers.
- Write the tests the phase's Verify list names, and write them so they fail for the right reason
  before they pass.
- If a requirement appears to need a new runtime dependency or a new external data source, **stop
  and ask**. Do not add either.

## At the gate — stop here

Run the phase's Verify list plus `npx tsc --noEmit`, `npm test`, `npm run lint`. Then report:

1. What landed, file by file.
2. Every named export you introduced, with its value and the reasoning for that value.
3. Each Verify item and the test that covers it.
4. Anything you could not satisfy, and why — stated plainly, not worked around.
5. Anything you deferred, as a `NOTES.md` candidate.

Then **stop and wait for approval.** Do not commit until the phase is approved. One conventional
commit per phase, scoped to that phase.

## The rule that outranks the others

If satisfying a requirement would mean weakening a constraint from an earlier layer — loosening an
ethics test, widening an authority ceiling, letting a partial run retract, allowing class
characteristics to individualize, letting a gap score as evidence — **do not do it and do not
propose a workaround.** Report the conflict. Those constraints are the product; the features exist
to serve them, not the other way round.


