// Reputation matching against seed known-good / known-bad lists, plus a
// Levenshtein-based lookalike check against the credible list (typosquatting).

import credible from "../data/known-credible.json";
import fake from "../data/known-fake.json";
import type { FactCheckItem, Reputation } from "./types";

const CREDIBLE: string[] = credible.domains;
const FAKE: string[] = fake.domains;

export function credibleList(): string[] {
  return CREDIBLE;
}
export function fakeList(): string[] {
  return FAKE;
}

/** Does `domain` equal or sit under any domain in `list`? */
function matchList(domain: string, list: string[]): string | null {
  for (const d of list) {
    if (domain === d || domain.endsWith(`.${d}`)) return d;
  }
  return null;
}

export function buildReputation(
  domain: string,
  factChecks: FactCheckItem[]
): Reputation {
  const matchedCredibleDomain = matchList(domain, CREDIBLE);
  const matchedFakeDomain = matchList(domain, FAKE);
  return {
    matchedCredible: Boolean(matchedCredibleDomain),
    matchedFake: Boolean(matchedFakeDomain),
    matchedCredibleDomain,
    matchedFakeDomain,
    factChecks,
  };
}

// ---- Lookalike / typosquatting detection -----------------------------------

/** Classic Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export interface LookalikeResult {
  isLookalike: boolean;
  target: string | null; // the credible domain being impersonated
  distance: number;
}

/**
 * Compare the registrable label (second-level part) of `domain` against the
 * credible list. A small but non-zero edit distance to a famous outlet — or
 * the famous brand appearing as a substring with extra tokens — flags
 * typosquatting (e.g. cnn-news24.com vs cnn.com).
 *
 * Genuine credible domains are never flagged: a domain that is itself on the
 * credible list is the real outlet, not an impersonator (this avoids false
 * positives like bbc.com "resembling" pbs.org on short 3-letter labels).
 */
export function detectLookalike(domain: string): LookalikeResult {
  const notLookalike: LookalikeResult = {
    isLookalike: false,
    target: null,
    distance: 99,
  };

  // A known-good domain cannot be impersonating another known-good domain.
  if (matchList(domain, CREDIBLE)) return notLookalike;

  const label = domain.split(".")[0]; // e.g. "cnn-news24"
  let best = notLookalike;

  for (const cred of CREDIBLE) {
    const credLabel = cred.split(".")[0];
    if (credLabel.length < 3) continue;
    if (label === credLabel) continue; // identical brand label — not a typo

    const dist = editDistance(label, credLabel);

    // Case 1: close misspelling (e.g. "reuturs" vs "reuters"). Restricted to
    // longer brand labels — a 1-2 edit on a 3-char label (bbc/pbs/cnn/npr) is
    // almost always coincidence, not typosquatting.
    const closeMisspell = credLabel.length >= 5 && dist > 0 && dist <= 2;

    // Case 2: brand embedded with extra tokens ("cnn-news24" contains "cnn"),
    // bounded by non-letters so unrelated substrings don't match.
    const brandEmbedded = new RegExp(
      `(^|[^a-z])${credLabel}([^a-z]|$)`
    ).test(label);

    if ((closeMisspell || brandEmbedded) && dist < best.distance) {
      best = { isLookalike: true, target: cred, distance: dist };
    }
  }

  return best;
}
