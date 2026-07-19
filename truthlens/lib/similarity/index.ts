// Near-duplicate clustering public API. One source of truth for the similarity
// threshold and the signature pipeline (normalize → shingle → minhash), used by
// both the CIB engine and the threat engine.

import { minhash, jaccard } from "./minhash";
import { shingleText } from "./shingle";

export { normalizeText } from "./normalize";
export { jaccard } from "./minhash";

/** Jaccard threshold above which two texts are treated as near-duplicates. */
export const JACCARD_THRESHOLD = 0.72;

/** MinHash signature for a raw text. */
export function signatureOf(text: string): number[] {
  return minhash(shingleText(text));
}

/**
 * Greedy near-duplicate clustering. Items whose signatures are within
 * JACCARD_THRESHOLD of a cluster's representative join it; empty text is skipped.
 * Returns clusters as arrays of the original items (order preserved).
 */
export function clusterNearDuplicates<T>(items: T[], getText: (t: T) => string): T[][] {
  const clusters: { rep: number[]; members: T[] }[] = [];
  for (const item of items) {
    const text = getText(item);
    if (!text || !text.trim()) continue;
    const sig = signatureOf(text);
    let placed = false;
    for (const c of clusters) {
      if (jaccard(sig, c.rep) >= JACCARD_THRESHOLD) {
        c.members.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ rep: sig, members: [item] });
  }
  return clusters.map((c) => c.members);
}
