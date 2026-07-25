---
description: Adversarially review a completed phase before approving it
argument-hint: <task-file> <phase>   e.g. docs/investigator/06-investigator-tradecraft.md P5
---

Review, do not implement. Arguments: $ARGUMENTS

You are reviewing work as though someone else wrote it and you expect it to be wrong. Do not fix
anything in this pass — finding and naming defects is the entire job, and mixing repair into review
is how a reviewer talks themselves into accepting what they just rewrote.

Read `docs/investigator/CLAUDE-invariants.md`, the task file, and the diff.

## Check, in this order

**1. Constraint erosion — the highest-value check.** Does this phase quietly widen a limit set by an
earlier phase? Look specifically for: a threshold moved, an ethics test relaxed or deleted, an
authority ceiling made configurable, a "temporarily" bypassed guard, a validator branch that returns
early, a test replaced by a weaker one. Report the diff line, not a summary.

**2. The named-export rule.** Any inline literal that determines a score, rank, confidence, tier,
direction, or threshold. Report each with its file and line.

**3. Model boundary.** Anything the model now decides that should be computed. If a number,
ranking, or confidence value can vary between two runs on identical input, that is a defect.

**4. The invariants.** Walk `CLAUDE-invariants.md` item by item and state, per item, whether this
diff could violate it and which test prevents that. "No test" is an answer and a finding.

**5. Test quality.** For each new test: would it fail if the feature were removed? A test that passes
against a stubbed-out implementation is worse than no test, because it certifies absence.

**6. Silent failure paths.** What happens on: empty evidence, a collector returning nothing, an LLM
timeout, a partial-coverage run, a malformed adapter response? Each should degrade visibly, never
into a confident-looking empty result.

## Report as

- **Blocking** — must be fixed before approval, each with file, line, and why it matters.
- **Non-blocking** — worth fixing, with the cost of not fixing it.
- **Deferred** — legitimate `NOTES.md` candidates.
- **Verdict** — approve, approve with conditions, or reject. If you cannot find anything blocking,
  say so plainly rather than inventing something to look thorough; but check clause 1 twice first,
  because constraint erosion is the defect that looks most like ordinary progress.


