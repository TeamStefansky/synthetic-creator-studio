// Domain-character classifier — a fast, transparent triage of a domain NAME into
// a character bucket, for grouping a reverse-DNS sweep of a host's IP ranges.
//
// HARD RULE (frozen): a domain NAME is an INDICATOR, not proof of content. Every
// classification carries that caveat and is a lead for a human, never a verdict.
// Pure + deterministic + unit-tested; Unicode-lowercased.

export type DomainCharacter = "extremist" | "activism" | "privacy" | "neutral";

export const CLASSIFY_VERSION = "domain-character-v1";

/** The caveat that MUST accompany any character label. */
export const NAME_NOT_CONTENT =
  "A domain name is an indicator of character, not proof of its content; verify before relying on it.";

// Keyword signals per bucket. Domain labels are frequently compounds
// ("scientistrebellion", "gnuhacker"), so we match keyword SUBSTRINGS — a domain
// name is a lead, not proof (every result carries the caveat). Extremist tokens
// are kept high-precision (unambiguous neo-Nazi / hate references) plus the
// boundaried numeric codes (88 / 1488) so the "red flag" bucket stays defensible.
const EXTREMIST = /(hitler|nazi|reich|whitepower|jewkill|holohoax|aryan|heil88|goyim|kkk)/i;
const EXTREMIST_NUM = /(^|[^0-9])(1488|8814|14word)([^0-9]|$)/i;
const ACTIVISM = /(antifa|anarch|rebellion|liberation|resist|revolt|piratar|freespeech|freedom)/i;
const PRIVACY = /(privacy|crypto|encrypt|anon|hacker|leet|darknet|onion|\bvpn|cipher|\bpgp|secure)/i;

/**
 * Classify a domain by its name. Extremist takes precedence (the flag that
 * matters most), then privacy/hacking, then activism, else neutral. Returns the
 * bucket plus the matched signal so the UI can show WHY, honestly.
 */
export function classifyDomainCharacter(domain: string): { character: DomainCharacter; signal?: string; caveat: string } {
  const d = (domain || "").toLowerCase();
  const ex = d.match(EXTREMIST) || d.match(EXTREMIST_NUM);
  if (ex) return { character: "extremist", signal: (ex[2] || ex[0]).trim(), caveat: NAME_NOT_CONTENT };
  const pv = d.match(PRIVACY);
  if (pv) return { character: "privacy", signal: pv[0], caveat: NAME_NOT_CONTENT };
  const ac = d.match(ACTIVISM);
  if (ac) return { character: "activism", signal: ac[0], caveat: NAME_NOT_CONTENT };
  return { character: "neutral", caveat: NAME_NOT_CONTENT };
}

/** Group a list of domains by character (extremist first). Neutral domains are
 * counted but not listed individually (they are the expected majority). */
export function groupByCharacter(domains: string[]): {
  extremist: { domain: string; signal?: string }[];
  activism: { domain: string; signal?: string }[];
  privacy: { domain: string; signal?: string }[];
  neutralCount: number;
  total: number;
  caveat: string;
} {
  const extremist: { domain: string; signal?: string }[] = [];
  const activism: { domain: string; signal?: string }[] = [];
  const privacy: { domain: string; signal?: string }[] = [];
  let neutralCount = 0;
  const seen = new Set<string>();
  for (const raw of domains) {
    const domain = (raw || "").trim().toLowerCase();
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const { character, signal } = classifyDomainCharacter(domain);
    if (character === "extremist") extremist.push({ domain, signal });
    else if (character === "privacy") privacy.push({ domain, signal });
    else if (character === "activism") activism.push({ domain, signal });
    else neutralCount++;
  }
  return { extremist, activism, privacy, neutralCount, total: seen.size, caveat: NAME_NOT_CONTENT };
}
