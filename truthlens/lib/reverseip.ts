// Reverse IP lookup via HackerTarget (optional, heavily rate-limited on free tier).
// Returns neighbor domains sharing the same IP.

import { getText } from "./http";

export async function reverseIp(ip?: string): Promise<string[]> {
  if (!ip) return [];
  const text = await getText(
    `https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`,
  );
  if (!text) return [];
  // Rate-limit / error responses come back as plain prose, not a domain list.
  if (/error|api count exceeded|no records|invalid/i.test(text)) return [];
  return text
    .split(/\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && l.includes(".") && !l.includes(" "))
    .slice(0, 50);
}
