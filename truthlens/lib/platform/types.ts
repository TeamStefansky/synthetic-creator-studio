// PlatformAccountProvider - the provider-agnostic interface that abstracts where
// account data comes from (module spec: "the concrete provider is env-gated...
// its absence must degrade gracefully"). A provider returns ONLY what its
// official API lawfully exposes; anything else stays undefined ("Not collected").
// No scraping and no unofficial wrapper APIs, ever (CLAUDE.md rules 5 & 7).

import type { AccountProfile } from "@/lib/authenticity/types";

export interface PlatformAccountProvider {
  name: string;
  /** Which platforms this provider can serve (mention `source` values). */
  supports(platform: string): boolean;
  /** Fetch a public account profile; null when unavailable/not found - the
   * caller then simply runs Phase-1 signals only. */
  fetchAccount(platform: string, handle: string): Promise<AccountProfile | null>;
}
