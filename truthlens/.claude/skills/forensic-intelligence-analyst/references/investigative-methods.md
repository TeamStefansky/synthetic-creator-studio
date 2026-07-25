# Investigative Methods — Forensic Science, Criminal Investigative Analysis, and Intelligence Doctrine

What follows is publicly documented methodology from four traditions. It is not folklore about
secret techniques. Where a method is contested inside its own field, that is stated — a method's
prestige is not evidence of its validity, and importing an unvalidated technique because it sounds
authoritative is exactly the error this file exists to prevent.

Contents:
1. Collection management — PIR → EEI → indicator → task
2. Forensic identification theory — class vs. individual characteristics
3. ACE-V, contextual bias control, and blind verification
4. Known error rates and proficiency testing
5. Criminal investigative analysis — MO vs. signature, staging, case linkage
6. Additional IC analytic techniques
7. Institutionalized dissent and the conception trap
8. Network analysis
9. Evidence dynamics — what happened to the artifact before it reached you
10. Order of volatility and dual-tool verification
11. Target and audience analysis
12. Structured pluralism — Team A/Team B, multiple scenarios, argument mapping
13. What is deliberately excluded

---

## 1. Collection management — PIR → EEI → indicator → task

Standard military and intelligence collection doctrine, and the correct spine for any investigation
that has a budget. It converts a vague question into a finite, prioritized task list:

- **PIR (Priority Intelligence Requirement)** — the decision-relevant question. There should be few.
  "Are these properties operated by one party?" is a PIR. "Tell me about this network" is not.
- **EEI (Essential Elements of Information)** — the specific facts required to answer a PIR.
  "Do they share a non-commodity identifier?" "Which appeared first, and at what timestamp tier?"
- **Indicator** — an observable whose presence or absence bears on an EEI, declared *in advance*,
  with its direction and its expected false-positive rate.
- **Task** — the concrete collection action for an indicator, with a cost and a probability of success.

The discipline this imposes: every collection action traces upward to a decision. A task that cannot
be traced to a PIR is curiosity, and curiosity is what exhausts budgets and fills boards with
non-diagnostic material.

**Collection plan matrix**: PIR × EEI × indicator × source × status. It doubles as the gaps register —
every unfilled cell is a known gap rather than an unknown one, which is the entire difference between
disciplined incompleteness and false confidence.

---

## 2. Forensic identification theory — class vs. individual characteristics

The single most transferable concept in forensic science, and the correct vocabulary for
discriminating power:

- **Class characteristics** — shared by all members of a group. Shoe tread pattern, blood type,
  ammunition caliber. Digitally: a CDN, an nginx banner, a registrar, WordPress, a country, a
  common ASN, `text/html`.
- **Individual characteristics** — arise from wear, damage, or deliberate configuration and are
  effectively unique. A specific nick in a shoe sole, striae on a fired bullet. Digitally: an analytics
  or AdSense identifier, a favicon hash, a self-signed certificate fingerprint, a distinctive
  near-duplicate content signature, an idiosyncratic build artifact.

**The rule that follows, and it is a hard one: class characteristics never individualize, no matter
how many you accumulate.** Twenty shared class characteristics do not become an identification; they
narrow a population. Only individual characteristics support a common-source conclusion. This is the
rigorous, field-tested version of "weak signals never sum to strong," and it is stronger because it
says *why*.

Every artifact type an analysis compares must be classified as class or individual **before** it is
used, with its base rate stated. An artifact whose base rate you cannot estimate is a class
characteristic by default.

---

## 3. ACE-V, contextual bias control, and blind verification

**ACE-V** (Analysis, Comparison, Evaluation, Verification) is the standard framework in friction-ridge
and toolmark examination:

- **Analysis** — assess the questioned item alone, on its own merits, and decide *before* comparison
  whether it has sufficient detail to support a conclusion at all.
- **Comparison** — compare against the known item.
- **Evaluation** — reach a conclusion: identification, exclusion, or **inconclusive**.
- **Verification** — an independent examiner repeats the process.

Two features matter more than the acronym:

**Sufficiency is decided before comparison.** Deciding whether an artifact is good enough *after*
seeing what it would prove is how weak evidence gets promoted. Fix the threshold first.

**Linear Sequential Unmasking (LSU)** — the examiner receives task-relevant information only, in a
fixed order, and never the case theory. Contextual bias research (Dror and others; adopted into NIST
OSAC guidance) demonstrated that examiners reach different conclusions on identical evidence when
given different case context. This is not a failing of unusually weak examiners; it is how expert
cognition works, which is why the fix is procedural rather than motivational.

**Verification must be blind** — the verifier must not know the first examiner's conclusion, or the
verification measures agreeableness rather than the evidence. Non-blind verification is worse than
none because it manufactures the appearance of independent confirmation.

**"Inconclusive" is a real and frequent result.** A framework whose examiners rarely return it is not
being applied.

---

## 4. Known error rates and proficiency testing

The 2009 NAS report and the 2016 PCAST report made the standard explicit: a method's conclusions mean
nothing without a **measured error rate on realistic material**, established by blind proficiency
testing, using a documented and repeatable procedure.

Applied to an analytic system, this is concrete rather than aspirational: maintain a standing suite of
**known-negative** fixtures (entities certain to be unrelated) and **known-positive** fixtures, run it
on every rubric change, and publish the measured false-positive rate alongside conclusions. A system
that asserts reliability without a measured error rate is asking to be trusted rather than checked.

The known-negative set matters more than the known-positive one. Anyone can find connections where
they exist; the question is whether the method invents them where they do not.

---

## 5. Criminal investigative analysis — MO, signature, staging, case linkage

From FBI Behavioral Analysis Unit practice. The behavioral concepts transfer to operations; the
person-profiling elements do not transfer to this domain and are excluded (section 9).

**Modus operandi vs. signature** — the most useful distinction here:

- **MO** is what is *necessary* to accomplish the act. It is learned, adapts to circumstance, and is
  cheap to change: hosting, registrar, CDN, platform, posting tool.
- **Signature** is what is *unnecessary* — behavior repeated because of how the operator works rather
  than because the task requires it: idiosyncratic phrasing and error patterns, image-processing
  habits, a distinctive publishing rhythm, recurring template misuse, consistent transliteration
  choices, the same broken markup carried across properties.

**Signature is far more probative than MO**, because MO changes under pressure and signature persists
under it. Two properties sharing a host share an MO. Two properties sharing an unnecessary habit share
something the operator did not choose to share — which is close to the digital equivalent of an
individual characteristic.

**Staging** — a scene deliberately arranged to convey a false narrative. The classic detection method
is **inconsistency of effort**: an operation displaying sophisticated tradecraft everywhere except at
one conveniently discoverable point is either careless in a very specific place or staged. Effort
asymmetry is the concrete, checkable indicator that turns "deception" from a vibe into a test, and it
should feed the deception hypothesis directly.

**Case linkage / comparative case analysis** — determining whether separate incidents share a source,
using behavioral consistency and distinctiveness. Its documented failure mode is **linkage blindness**
in one direction and over-linkage in the other: analysts link on features that are common across the
population (class characteristics again) and miss links resting on genuinely distinctive but
unglamorous details. Rank candidate linkages by distinctiveness, never by salience.

---

## 6. Additional IC analytic techniques

Beyond ACH, Key Assumptions Check, Quality of Information Check, devil's advocacy, red team, and
Indicators & Warning (see `structured-analytic-techniques.md`):

- **Premortem** — before publishing, assume it is six months later and the judgment was proven
  badly wrong, then explain how. Prospective hindsight surfaces failure paths that "what could go
  wrong?" reliably misses, because it removes the need to defend the conclusion while critiquing it.
- **Structured self-critique** — a fixed checklist run against your own product: sources, assumptions,
  diagnosticity, alternative explanations, deception, information gaps, changed circumstances.
- **What-if analysis** — assume a surprising outcome has already occurred and work backwards to what
  must have been true. Useful when the leading judgment is comfortable.
- **High-impact / low-probability analysis** — examine consequential outcomes that current evidence
  makes unlikely, to identify the indicators that would signal them early.
- **Outside-in thinking** — start from the external forces acting on the subject (regulatory, market,
  platform policy, geopolitical) rather than from the evidence at hand, to surface drivers the
  collection never touched.
- **Diagnostic reasoning** — for each new item, ask what it would look like under *each* hypothesis
  before deciding what it means. This is the per-item habit that ACH formalizes at the matrix level.

---

## 7. Institutionalized dissent and the conception trap

The most valuable publicly documented contribution of Israeli intelligence practice to analytic
method, and it comes from a failure rather than a success.

**The conception (הקונספציה).** The 1973 intelligence failure was not primarily a collection failure —
much of the relevant information had been collected. It was an interpretive failure: a dominant
conceptual framework held with such confidence that incoming evidence was fitted into it, and
contradicting indicators were explained away individually as they arrived. Each explanation was
locally reasonable. The aggregate was catastrophic.

The Agranat Commission's structural remedies are what matter here:

- **Ipcha Mistabra** (איפכא מסתברא, "the opposite is likely") — a standing devil's-advocate function
  inside the analytic body, with its own authority and an obligation to circulate dissent. Critically,
  it is a **permanent office rather than an occasional exercise**, and it cannot be overruled by the
  main analytic line. An adversarial review that the mainline can dismiss is decoration.
- **Pluralism of assessment** — more than one body assessing independently, so a single framework
  cannot become the only framework.
- **A duty to dissent**, protected structurally rather than left to individual courage.

**The operational signature of a conception, and this is directly measurable:** as a framework
hardens, the rate at which incoming evidence is scored *inconsistent* with the leading hypothesis
falls toward zero — while collection continues at the same volume. A leading hypothesis that stops
accumulating contradictions is usually not becoming truer; it is becoming a filter. Track that ratio
over time and treat its collapse as a warning, not as confirmation.

---

## 8. Network analysis

Applied to entities and infrastructure — never to people in this domain:

- **Degree centrality** — how many connections a node has. Often just popularity or commodity hosting;
  weak on its own.
- **Betweenness centrality** — how often a node sits on the path between others. Identifies brokers:
  the node whose removal most fragments the network.
- **Cut vertices / bridges** — nodes and edges whose removal splits the graph. A structure held
  together by one bridge is one artifact away from not being a structure, and saying so is more useful
  than reporting its size.
- **Structural holes** — gaps between clusters that a broker spans. Where a claim crosses language or
  platform, the spanning node is usually the most informative one in the graph.

The standard caution: centrality measures describe the graph **you collected**. A node is central
partly because you looked at its neighbourhood, and a sampled network's centrality rankings are
frequently artifacts of the sampling. Report centrality with the collection boundary attached, always.

---

## 9. Evidence dynamics — what happened to the artifact before it reached you

Crime-scene doctrine (Chisum & Turvey) treats **evidence dynamics** as a first-order concern: any
influence that changes, moves, obscures, or destroys evidence between the event and its collection.
Weather, first responders, medical intervention, decomposition, a helpful bystander tidying up. The
reconstruction is of the scene *as it now is*, and every inference must account for what altered it.

Digitally this is larger than in the physical world and is routinely ignored:

| Dynamic | Effect |
|---|---|
| CDN normalization and minification | Rewrites markup and headers; two unrelated sites behind the same edge converge |
| Image pipelines | Re-encode, strip EXIF, resize, re-compress — producing *identical artifacts across unrelated properties* |
| Platform transcoding | Video/audio re-encoded on upload; the file you analyze is the platform's, not the uploader's |
| Caching layers | You may be reading a stale copy; timestamps reflect the cache, not the origin |
| Archive rewriting | Archive services rewrite links and inject markup; the capture is not the page |
| AMP / reader transforms | Structure and metadata replaced wholesale |
| Tracking-parameter stripping | Referral and campaign structure destroyed by intermediaries |
| Unicode and transliteration normalization | Language tells flattened by input methods and CMSs |
| Bot re-crawls and previews | Access logs contaminated by infrastructure, not visitors |
| Email gateway rewriting | Headers and links altered in transit by security products |

**The consequence that matters most, and it corrects a naïve reading of section 5: shared processing
masquerades as shared signature.** Two unrelated sites using the same image optimizer produce
identical re-encode artifacts. Two unrelated sites behind the same CDN produce identical minified
markup quirks. Counting those as behavioral signature manufactures links at scale, and it does so in a
way that looks impressively technical.

The control: before a signature feature counts, establish the **processing baseline** — what the
platform, CDN, CMS, or toolchain would produce for *any* user. A feature indistinguishable from the
baseline is a class characteristic of that toolchain, not an individual characteristic of an operator.
Only variation the toolchain does not impose can carry weight.

Corollary for sequencing: a timestamp altered by a dynamic is not a lie by the subject. Before treating
an inconsistent time as deception, ask which layer rewrote it.

---

## 10. Order of volatility and dual-tool verification

**Order of volatility** (NIST SP 800-86 and standard digital-forensic practice): collect the most
perishable evidence first, because acquisition itself takes time and the world does not wait. In
open-source work the ordering is roughly: live page content and current DNS answers → platform posts
and their engagement state → ephemeral formats (stories, live streams, status text) → registry and
certificate records → archives. Registry records are stable; a post is not. Collecting stable material
first because it is easier is how the perishable evidence gets lost.

Every collection must record **when** it happened, because a run's findings describe the world at
acquisition time, not at analysis time.

**Dual-tool verification** — a load-bearing finding must be reproducible with a **second independent
tool or method** before it can carry a conclusion. This is distinct from blind verification (section 3)
and catches a different error: blind verification controls the *examiner*, dual-tool controls the
*instrument*. A single resolver, a single WHOIS proxy, or a single similarity implementation can be
wrong, stale, or subtly misconfigured in ways no amount of careful examination reveals.

Where two tools disagree, the disagreement is the finding. Do not pick the one that fits.

---

## 11. Target and audience analysis

The investigative analogue of victimology: the choice of target is evidence about the actor. In
influence-operation work this stays at the level of **communities and audience segments**, never
individuals.

What the targeting reveals:

- **Language register and dialect choice** — who the content assumes it is speaking to, which is often
  narrower than the language it is written in.
- **Platform and community selection** — where the operation tried to enter, and whether the entry
  points suggest familiarity with the community or a generic outside model of it.
- **Grievance selection** — which existing tension the content attaches itself to. Operations rarely
  invent grievances; they select from what is already present, and the selection reflects the actor's
  model of the audience.
- **Timing relative to the target's news cycle** rather than the actor's — content timed to a
  community's calendar suggests attention to that community.
- **Mismatches** — a striking one: content that misreads its own target audience (wrong register, dated
  references, mistranslated idiom, imported framing that does not exist locally) indicates distance
  between the operator and the audience, and is one of the more reliable available tells.

The ethical boundary is firm and worth stating explicitly, because this technique degrades easily:
analysis stays at segment level and describes the *operation's* model of an audience. It must never
become a list of individuals assessed as susceptible. That artifact is a targeting product, and
producing it inverts the purpose of the work.

---

## 12. Structured pluralism — Team A/Team B, multiple scenarios, argument mapping

A single devil's advocate is better than none and still one point of failure. Where the stakes justify
the cost:

**Team A / Team B** — two analyses of the same evidence conducted independently, with different
starting assumptions, then compared. The product is the comparison: where they converge, confidence is
earned; where they diverge, the divergence localizes the real uncertainty. The requirement that makes
it work is genuine independence — teams that see each other's interim reasoning produce one analysis
with extra steps.

**Multiple scenarios generation** — identify the two or three key drivers, vary them, and generate the
resulting accounts. Useful when evidence underdetermines the answer, which is most of the time. It
converts "we don't know" into a structured set of what-would-have-to-be-true statements, each with its
own indicators.

**Argument mapping** — render the inference chain explicitly: claim, premises, the warrant connecting
them, and objections attached at the point they bite. Most analytic errors are invisible in prose and
obvious in a map, because prose lets a warrant stay unstated while a map has a visible empty box where
it should be. Particularly valuable when a judgment is reviewed by someone who did not build it.

Use these when the judgment is consequential, contested, or long-running. They are expensive, and
spending that cost on a routine finding is its own failure of prioritization.

---

## 13. What is deliberately excluded

Not everything from these traditions belongs in an open-source analytic tool, and some of it belongs
in no automated system at all:

- **HUMINT operations** — source recruitment, elicitation, cover, agent handling, asset validation.
  Different discipline, different ethics, and nothing in an OSINT pipeline calls for it. (Where a user
  legitimately needs interpersonal assessment methodology, that lives in a separate skill.)
- **Surveillance, tracking, and covert access** — outside the scope of public-source analysis and
  outside the legal basis such a tool operates on.
- **Targeting cycles** — the analytic portions (exploit, analyze, disseminate) are ordinary
  intelligence process; the action portions are not analysis and have no place in a read-only system.
- **Person profiling in influence-operation work** — behavioral analysis of *operations* is legitimate;
  psychological profiling of named individuals from their digital exhaust is a different act with
  different consequences, and the concepts in section 5 must stay at the level of the operation.
- **Polygraph, statement-analysis scoring systems, and similar contested instruments** — insufficiently
  validated to carry weight in a documented judgment, whatever their institutional pedigree.

Excluding these is not caution for its own sake. A method imported without its surrounding controls,
its legal basis, and its measured error rate is a liability dressed as rigor.


