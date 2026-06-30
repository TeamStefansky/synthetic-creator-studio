// Loads the operator-defined adversary-country policy. Neutral by default:
// ships with an empty list so the operator sets their own policy.

import adversaryData from "@/data/adversary-countries.json";

const codes = new Set(
  ((adversaryData as { codes?: string[] }).codes || []).map((c) =>
    c.trim().toUpperCase(),
  ),
);

export function adversaryCodes(): string[] {
  return Array.from(codes);
}

export function isAdversaryCountry(country?: string): boolean {
  if (!country) return false;
  return codes.has(country.trim().toUpperCase());
}
