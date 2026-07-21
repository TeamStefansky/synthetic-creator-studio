// Env-gated provider resolver — mirrors the lib/osint.ts gating pattern:
// unconfigured → null → the caller degrades gracefully to Phase-1 signals only
// (a visible lower confidence, never a faked account layer).
//
//   PLATFORM_PROVIDER=official → official-API adapter (Bluesky keyless; X gated)
//   PLATFORM_PROVIDER=stub     → deterministic fixtures (tests/dev only)
//   unset / anything else     → null

import { stubProvider } from "./adapters/stub";
import { officialProvider } from "./adapters/official";
import type { PlatformAccountProvider } from "./types";

export type { PlatformAccountProvider } from "./types";

export function resolvePlatformProvider(): PlatformAccountProvider | null {
  const kind = (process.env.PLATFORM_PROVIDER || "").trim().toLowerCase();
  if (kind === "official") return officialProvider();
  if (kind === "stub") return stubProvider();
  return null;
}
