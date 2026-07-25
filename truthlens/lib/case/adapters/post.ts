// Post Check -> EvidenceItem drafts (layer 03 · P1). The existence of a claim in
// a source is a fact (graded self_byline / D4); its truth verdict is model-derived
// and is NOT recorded as a fact. A self-reported publish time is T3 at best.
// `datePublished` may be supplied explicitly for tier assignment.

import type { EvidenceDraft } from "../types";
import { draft, eventTime, mkProvenance } from "./util";

export function postToEvidence(post: any): EvidenceDraft[] {
  if (!post) return [];
  const url = post.input || post.url || "";
  const ek = `post:${url || "unknown"}`;
  const at = post.checkedAt || new Date(0).toISOString();
  const out: EvidenceDraft[] = [];
  for (const c of Array.isArray(post.claims) ? post.claims : []) {
    if (!c?.claim) continue;
    out.push(draft({
      entityKey: ek, kind: "claim", value: c.claim,
      // Self-reported byline is T3 only; supplied via post.datePublished when known.
      eventTime: eventTime(post.datePublished, "T3"),
      notes: `post-check verdict: ${c.verdict ?? "unverified"} (model-derived, not a fact)`,
      provenance: mkProvenance({ sourceClass: "self_byline", sourceUrl: url, collectedAt: at, bytes: c.claim, collector: "post", lineageId: `post:${url}` }),
    }));
  }
  return out;
}
