import { countryFlag } from "./format";

/** A pragmatic subset of ISO 3166-1 alpha-2 codes for the country selectors. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "IL", name: "Israel" },
  { code: "UA", name: "Ukraine" },
  { code: "RU", name: "Russia" },
  { code: "PL", name: "Poland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "BR", name: "Brazil" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },
  { code: "TR", name: "Turkey" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "EG", name: "Egypt" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
];

export function countryOption(code: string): string {
  const c = COUNTRIES.find((x) => x.code === code);
  return `${countryFlag(code)} ${c ? c.name : code}`;
}
