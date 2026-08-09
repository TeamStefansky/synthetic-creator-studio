// Domain-character classifier — a fast, transparent triage of a domain NAME into
// a character bucket, for grouping a reverse-DNS sweep of a host's IP ranges.
//
// HARD RULE (frozen): a domain NAME is an INDICATOR, not proof of content. Every
// classification carries that caveat and is a lead for a human, never a verdict.
// Pure + deterministic + unit-tested; Unicode-lowercased.

import { idnToUnicode } from "./punycode";

export type DomainCharacter = "extremist" | "activism" | "privacy" | "neutral";

export const CLASSIFY_VERSION = "domain-character-v2";

/** The caveat that MUST accompany any character label. */
export const NAME_NOT_CONTENT =
  "A domain name is an indicator of character, not proof of its content; verify before relying on it.";

// Multilingual keyword signals. IDN (xn--…) labels are decoded to their native
// script first, so these match Hebrew/Arabic/Cyrillic/Greek/CJK domains too.
// Domain labels are compounds ("scientistrebellion"), so we match SUBSTRINGS — a
// name is a lead, not proof (every result carries the caveat). Extremist tokens
// are kept high-precision (unambiguous neo-Nazi / hate references across
// languages + transliterations) so the "red flag" bucket stays defensible.
// "nazi" needs care: exclude "nazionale/nazionali" (Italian "national"). Handled
// by NAZI_RE below, so it is NOT in the plain substring list.
const NAZI_RE = /nazi(?!onal)/i;
const EXTREMIST_WORDS = [
  // Latin / German / transliterations
  "hitler", "nsdap", "fuhrer", "fuehrer", "siegheil", "sieg-heil",
  "heilhitler", "hakenkreuz", "aryan", "aryannation", "whitepower", "white-power",
  "bloodandhonour", "blood-honour", "combat18", "kkk", "holohoax", "judenfrei",
  "judenrein", "drittereich", "drittesreich", "thirdreich", "reichskrieg", "reichsfuhrer",
  "totenkopf", "stormfront", "groyper",
  // Hebrew
  "היטלר", "נאצי", "נאצים", "צלב-קרס", "צלבקרס",
  // Arabic
  "هتلر", "نازي", "النازية",
  // Cyrillic (Russian/Ukrainian) — boundaried forms to avoid "национал" (national)
  "гитлер", "нацист", "нацизм", "зигхайль", "зиг-хайль", "фюрер", "свастика",
  // Greek
  "χίτλερ", "ναζί",
];
const EXTREMIST_NUM = /(^|[^0-9])(1488|8814|14words?|combat18)([^0-9]|$)/i;

const ACTIVISM_WORDS = [
  // Latin
  "antifa", "anarch", "rebellion", "liberation", "resist", "revolt", "piratar",
  "freespeech", "freedom", "intifada", "resistance",
  // Hebrew
  "מרד", "התנגדות", "אנרכי", "חירות",
  // Arabic
  "انتفاضة", "مقاومة", "ثورة", "تحرير",
  // Cyrillic
  "анархи", "сопротивлен", "восстани", "свобода",
];
const PRIVACY_WORDS = [
  "privacy", "crypto", "encrypt", "anon", "hacker", "leet", "darknet", "onion",
  "cipher", "secure", "torproject", "pgp", "vpn",
  // other scripts
  "פרטיות", "הצפנה", "خصوصية", "تشفير", "приватност", "шифрован", "хакер",
];

function firstHit(haystack: string, words: string[]): string | undefined {
  for (const w of words) if (haystack.includes(w)) return w;
  return undefined;
}

/**
 * Classify a domain by its name, across all scripts. IDN labels are decoded to
 * Unicode first. Extremist takes precedence (the flag that matters most), then
 * privacy, then activism, else neutral. Returns the matched signal so the UI can
 * show WHY, honestly.
 */
export function classifyDomainCharacter(domain: string): { character: DomainCharacter; signal?: string; caveat: string } {
  const d = idnToUnicode((domain || "").trim()).toLowerCase();
  const num = d.match(EXTREMIST_NUM);
  const nazi = d.match(NAZI_RE);
  const ex = firstHit(d, EXTREMIST_WORDS) || (nazi ? nazi[0] : undefined) || (num ? (num[2] || num[0]).trim() : undefined);
  if (ex) return { character: "extremist", signal: ex, caveat: NAME_NOT_CONTENT };
  const pv = firstHit(d, PRIVACY_WORDS);
  if (pv) return { character: "privacy", signal: pv, caveat: NAME_NOT_CONTENT };
  const ac = firstHit(d, ACTIVISM_WORDS);
  if (ac) return { character: "activism", signal: ac, caveat: NAME_NOT_CONTENT };
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
