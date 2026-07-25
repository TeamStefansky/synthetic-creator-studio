# Structured Analytic Techniques

Contents:
1. Analysis of Competing Hypotheses (ACH)
2. Key Assumptions Check
3. Quality of Information Check
4. Devil's Advocacy / Red Team
5. Indicators & Warning
6. Deception detection — MOM-POP, MOSES, EVE
7. Choosing a technique

---

## 1. Analysis of Competing Hypotheses (ACH)

The core technique. Its value is that it inverts the natural mode: instead of gathering support for
the favored explanation, it eliminates explanations that the evidence contradicts. That inversion is
the structural fix for confirmation bias — it works even when the analyst is motivated.

**Procedure**

1. **Generate the hypothesis set first, before weighing.** At least three, mutually exclusive where
   possible, and always including:
   - the **null hypothesis** — unrelated actors, commodity infrastructure, coincidence, organic
     behavior. Never omit it and never score it more harshly than the others.
   - the **deception hypothesis**, where a capable and motivated actor is plausible.
2. **List the diagnostic evidence** — every significant item, and also the arguments and assumptions
   in play, which are evidence about your own reasoning.
3. **Build the matrix.** For each cell, ask the ACH question — not "does this fit?" but
   *"how likely is this evidence if this hypothesis were true?"* Mark **consistent /
   inconsistent / neutral**.
4. **Score by inconsistency.** The leading hypothesis is the one with the **fewest inconsistencies**,
   not the most consistencies. A hypothesis consistent with everything is usually just vague.
5. **Identify diagnostic evidence** — items that discriminate between hypotheses. Evidence consistent
   with every hypothesis is worthless for choosing between them, however impressive it looks.
   Down-weight it visually and analytically; a wall covered in non-diagnostic material is how a
   board becomes a conspiracy theory with good production values.
6. **Refine and re-run.** Drop non-diagnostic items, add hypotheses that emerged.
7. **Report sensitivity.** State which one or two items, if wrong, would flip the ranking. If the top
   two hypotheses are close, the verdict is **undetermined** — report that rather than picking.
8. **Derive the falsification list** — what evidence, if collected, would break the leader. This is
   simultaneously the honest caveat and the next collection plan.

**Failure modes**
- Hypotheses invented to lose — a straw null hypothesis is worse than none, because it launders the
  favored answer through a technique that looks rigorous.
- Evidence entered after the ranking formed and scored through it (record when each item entered).
- Deception used as a trump card: it can absorb any contradiction, so score it by the same
  inconsistency rules and require positive indicators (section 6) rather than treating it as always-available.

---

## 2. Key Assumptions Check

List every assumption the analysis rests on — including the ones so obvious nobody wrote them down,
which are precisely the dangerous ones. For each: why do we believe it, what would happen to the
judgment if it were false, and how confident are we in it?

An assumption that is (a) load-bearing and (b) low-confidence is the most important finding in the
product. Surface it in the summary, not the appendix. Most analytic surprises are not new evidence —
they are an old assumption quietly failing.

---

## 3. Quality of Information Check

Periodically audit the evidence base itself rather than the conclusions:

- Which items are doing the actual work? Are they well graded?
- Any single points of failure — one source, one artifact, one collector?
- Any circular sourcing — items that look independent but trace to one origin?
- Has anything decayed, been superseded, or failed re-verification?
- Would the judgment survive the removal of the single strongest item?

That last question is the fastest diagnostic in this entire document. If the answer is no, the
confidence rating is too high.

---

## 4. Devil's Advocacy / Red Team

Assign someone (or yourself, deliberately and in writing) to build the strongest possible case
*against* the leading judgment, using the same evidence. Not to find flaws — to construct a genuine
rival account.

Two rules keep it honest: it must be written out in full rather than gestured at, and it must use
the actual evidence rather than hypotheticals. If the counter-case is easy to build, the judgment
was not ready.

Red Team goes further: reason from the subject's perspective, resources, and constraints rather than
your own. The specific error it catches is mirror-imaging — assuming the actor optimizes what you
would optimize.

---

## 5. Indicators & Warning

Define, **in advance**, the observable indicators that would signal a change. Defining them
afterward is pattern-matching on noise, and it is how monitoring systems generate escalation stories
out of ordinary variance.

Each indicator needs: what precisely would be observed, which hypothesis it supports or undercuts,
how it will be collected, and what its false-positive rate looks like. An indicator that fires on
routine activity is worse than none — it trains the reader to ignore the channel.

For continuous monitoring, this maps directly to alerting: alert on **conclusion changes**, not on
evidence churn. If the picture hasn't changed, silence is the correct output.

---

## 6. Deception detection

Assess deception structurally rather than by feel. Three checklists:

**MOM — the adversary's deception capability**
- **Motive** — what would they gain by making you believe this?
- **Opportunity** — did they have access to the channel you collected from?
- **Means** — do they have the capability and track record for this kind of deception?

**POP — past opposition practices**
- Have they done this before? Deception is a habit with a signature; look for the signature.

**MOSES — my own sources**
- How vulnerable is each source to manipulation? Which could be fed? Anything that arrived
  unusually easily deserves the question: *why was this so easy to get?*

**EVE — evaluation of the evidence itself**
- Accuracy of the details that can be independently checked.
- Internal consistency, especially in the parts an author wouldn't expect to be scrutinized.
- **Convenience** — evidence that arrives exactly when needed and points exactly where wanted is
  either luck or design. Weight it *down*, not up.
- Chain of custody from creation to your hands.

The asymmetry to hold in mind: deception explains everything, so it must be constrained by requiring
positive MOM-POP indicators before it outranks simpler hypotheses. Otherwise it becomes
unfalsifiable and quietly destroys the analysis it was meant to protect.

---

## 7. Choosing a technique

| Situation | Technique |
|---|---|
| Multiple explanations, contested evidence | ACH |
| The judgment feels solid but rests on something unexamined | Key Assumptions Check |
| The evidence base has grown organically over time | Quality of Information Check |
| Consensus formed quickly and comfortably | Devil's Advocacy |
| A capable adversary and conveniently available evidence | MOM-POP / MOSES / EVE |
| Ongoing situation, need early signal | Indicators & Warning, defined in advance |
| The subject's behavior looks irrational to you | Red Team |

Run at least two on any consequential product. Techniques catch different errors, and the one you
skip is the one that would have caught yours.


