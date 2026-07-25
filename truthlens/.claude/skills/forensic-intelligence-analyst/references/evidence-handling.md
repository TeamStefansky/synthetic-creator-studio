# Evidence Handling, Chain of Custody, and Sequencing

Contents:
1. Acquisition vs. analysis
2. The evidence record
3. Chain of custody and integrity
4. Timestamp tier model
5. Clock skew, timezones, and forged times
6. Evidence decay and spoliation
7. Negative evidence procedure
8. Common failure patterns

---

## 1. Acquisition vs. analysis

Keep the two phases physically separate. Acquisition captures and preserves; analysis interprets a
copy and never the original. The reason is not ceremony: an analyst who edits, re-fetches, or
re-normalizes source material mid-analysis destroys the ability to answer "was it like that when
you found it?" — and that question is the first one an adversary, a lawyer, or a careful reader asks.

Practical rules:
- Capture before you read. Archive the artifact (snapshot service, WARC, screenshot with full-page
  capture, raw response headers) at the moment of first observation.
- Never analyze a live resource as if it were stable. Live resources change under you and are
  sometimes changed *because* of you.
- Record the acquisition method, not just the result. "Fetched via HTTPS GET, no auth, from IP in
  country X, at time T" is part of the evidence.

---

## 2. The evidence record

One normalized record per fact. Minimum fields:

| Field | Why it matters |
|---|---|
| `id` | Deterministic hash of (kind, subject, normalized value, source) so the same fact found twice collapses into one record with two provenances |
| `kind` | The artifact class — drives discriminating power |
| `value` / `normalizedValue` | Normalization is what makes dedup and comparison possible |
| `sourceUrl` | Where it came from |
| `archiveUrl` | The surviving record when the source dies |
| `contentHash` | Hash of the retrieved bytes, not the URL — this is the integrity anchor |
| `acquiredAt` | When we captured it |
| `eventAt` + `timeTier` | When the underlying event occurred, and how much that time can be trusted |
| `sourceGrade` / `infoCredibility` | Admiralty A–F × 1–6, graded independently |
| `collector` + `collectorVersion` | Reproducibility; also lets you invalidate a batch when a collector is found buggy |
| `state` | `live` / `archived-only` / `lost` — never delete |
| `enteredCaseAt` | Enables detecting post-hypothesis collection bias |

Deduplicating on **content** rather than source is important and often missed: two independent
sources yielding the same fact is corroboration, and if you store them as two unrelated rows you
lose the corroboration signal and double-count the fact at the same time.

---

## 3. Chain of custody and integrity

Hash the retrieved bytes. A source URL proves nothing about what the page said when you read it;
a hash plus an archived capture does. Store the hash with the record and re-verify it whenever the
evidence is re-used in a later product.

Maintain an append-only log: who/what acquired it, when, by what method, every subsequent state
change, and every analytic product that relied on it. If a finding is later overturned, this log is
how you find everything else that rested on it.

Never mutate an evidence record. Corrections are new records superseding old ones, with the
supersession recorded. A ledger you can silently edit is not a ledger.

---

## 4. Timestamp tier model

The single most important table in this reference. Every `eventAt` gets a tier:

| Tier | Meaning | Examples | Tolerance | What it can prove |
|---|---|---|---|---|
| **T1 Authoritative** | Recorded by an independent system at the time of the event | RDAP/WHOIS creation date, SSL `notBefore`, Certificate Transparency log entry, platform-native publish time from an official API, third-party server logs | ±0 | Both existence by, and — where the system is complete — non-existence before |
| **T2 Corroborated** | Independently observed after the fact, or two independent T3s agreeing | First archive.org snapshot, our own capture, two unrelated sources agreeing within tolerance | ±24h | Existence by that time; a *usable* lower bound for ordering |
| **T3 Claimed** | The artifact asserts it about itself | Byline, JSON-LD `datePublished`, `<time>` element, EXIF, document metadata, filesystem mtime | ±7d | Almost nothing on its own — trivially forged, and forged precisely when it matters |
| **T4 Observation only** | When *we* first saw it | Crawl time, check time, first mention in our own records | Upper bound only | That it existed **by** then. **Never** that it did not exist earlier |

**The asymmetry of T4 is the rule most often broken.** "We first saw it on the 14th" is not
"it appeared on the 14th." Treating an observation time as an event time manufactures sequences,
and manufactured sequences are the raw material of false attribution.

**Ordering rule:** claim A → B only when both endpoints are **T2 or better** and the gap exceeds
the wider tolerance. Otherwise: *order not established*. Report the pair as related-but-unordered;
do not silently drop it, because the analyst needs to see that the relationship exists and the
sequence doesn't.

---

## 5. Clock skew, timezones, and forged times

- Normalize everything to UTC for comparison, but **preserve the original offset**. Operating hours
  and weekend patterns are behavioral evidence; stripping the offset destroys them.
- Independent systems disagree by seconds to minutes. Do not read an ordering out of a gap smaller
  than plausible skew between the two sources.
- Self-reported times are adversary-controlled. Where deception is plausible, treat a T3 timestamp
  that *conveniently* supports a hypothesis as weaker, not stronger — it is exactly the field an
  actor would set.
- Watch for timezone tells that are themselves evidence (a "local" newsroom posting on another
  continent's business hours) — but remember scheduling tools, VPNs, and diaspora staff explain the
  same pattern. This is a weak indicator that becomes meaningful only in combination.

---

## 6. Evidence decay and spoliation

Sources die. Handle it as a state machine, never as deletion:

- **live** → source resolves, content hash matches.
- **archived-only** → source gone, archive capture survives. Strength is unchanged; the fact was
  captured under custody.
- **lost** → source gone, no capture. The fact is now unverifiable.

When a conclusion rests **solely** on `lost` evidence, downgrade it and say so. When evidence
disappears shortly after it was collected or referenced, note the timing — but resist the pull:
sites break, hosts expire, and platforms purge constantly. Removal is weak evidence of
consciousness of guilt and strong evidence of nothing.

Archive proactively. Decay is far cheaper to prevent than to litigate.

---

## 7. Negative evidence procedure

To convert an absence into evidence, all four must hold. State each explicitly:

1. **Prediction** — hypothesis H specifically predicts artifact Y.
2. **Adequacy** — the search for Y was capable of finding it (right source, right period, right
   access level, no rate-limit or budget truncation).
3. **Coverage** — the source that would hold Y was actually reachable and complete for the relevant
   window.
4. **Result** — Y was not found.

If 2 or 3 fail, this is a **gap** and carries no evidential weight in either direction. Record it in
the gaps register, not in the evidence set.

The distinction has a systems consequence worth stating: a collection run that was truncated by
budget, rate limits, or an outage produces absences that look identical to negative evidence.
Any process that can retract findings must know whether its coverage was complete, and a degraded
run must be allowed to add findings and forbidden to remove them.

---

## 8. Common failure patterns

| Pattern | What it looks like | Fix |
|---|---|---|
| Observation-as-event | "It appeared on the 14th" from a crawl time | Enforce the T4 asymmetry in the data model |
| Metadata credulity | Sequencing from EXIF or file mtime | T3 needs corroboration before it orders anything |
| Absence inflation | "No trace of X, so X didn't happen" after a partial search | Run the four-step negative evidence test |
| Silent retraction | A finding vanishes between reports with no record | Append-only ledger, supersession records |
| Corroboration double-count | Same wire story in six outlets counted as six sources | Dedup on content; one origin, one weight |
| Custody gap | Screenshot with no hash, no headers, no capture time | Capture method and integrity hash at acquisition |
| Convenient timestamp | A self-reported time that neatly supports the theory | Weight it *down* under a live deception hypothesis |


