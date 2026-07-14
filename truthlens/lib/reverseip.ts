// Reverse-IP neighbor lookup via HackerTarget (free tier, heavily rate-limited).
// Returns other domains hosted on the same IP — useful for fleshing out the
// operator graph, but treated as best-effort and capped to avoid noise.

import { getText } from "./httpClient";

export async function reverseIp(ip: string): Promise<string[]> {
  const text = await getText(
    `https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`
  );
  if (!text) return [];

  // The free API returns either a newline-separated list of hostnames or an
  // error/usage message. Filter to things that look like domains.
  if (/error|api count|exceeded|no records|invalid/i.test(text)) return [];

  const domains = text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.includes(".") && !l.includes(" "));

  // De-dupe and cap so one busy shared host doesn't explode the graph.
  return Array.from(new Set(domains)).slice(0, 25);
}
