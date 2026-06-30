// Match a domain (and its connected identifiers) against seed credible/fake lists.

import credible from "@/data/known-credible.json";
import fake from "@/data/known-fake.json";
import type { Reputation, FactCheckItem } from "./types";

const credibleSet = new Set(
  (credible.domains || []).map((d) => d.toLowerCase()),
);
const fakeSet = new Set((fake.domains || []).map((d) => d.toLowerCase()));

export function credibleDomains(): string[] {
  return Array.from(credibleSet);
}
export function fakeDomains(): string[] {
  return Array.from(fakeSet);
}

function rootMatch(domain: string, set: Set<string>): string | undefined {
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (set.has(d)) return d;
  // match if d is a subdomain of a listed root
  for (const known of set) {
    if (d === known || d.endsWith("." + known)) return known;
  }
  return undefined;
}

export function matchReputation(
  domain: string,
  factChecks: FactCheckItem[],
  siblingDomains: string[] = [],
): Reputation {
  const matchedCredibleDomain = rootMatch(domain, credibleSet);
  let matchedFakeDomain = rootMatch(domain, fakeSet);

  // Guilt-by-infrastructure: a sibling (shared IP/SAN/ad-id) on the fake list.
  if (!matchedFakeDomain) {
    for (const s of siblingDomains) {
      const m = rootMatch(s, fakeSet);
      if (m) {
        matchedFakeDomain = m;
        break;
      }
    }
  }

  return {
    matchedCredible: !!matchedCredibleDomain,
    matchedFake: !!matchedFakeDomain,
    matchedCredibleDomain,
    matchedFakeDomain,
    factChecks,
  };
}
