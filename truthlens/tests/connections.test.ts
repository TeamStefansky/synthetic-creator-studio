// Connection status. Gates: keyless integrations are always connected; a
// key-gated one is connected only when ALL its env vars are present; anyOf
// (KV vs Upstash) needs just one; the summary counts + groups correctly.

import { describe, it, expect, afterEach, vi } from "vitest";

async function fresh() {
  vi.resetModules();
  return await import("../lib/connections");
}

const CLEAR = [
  "ANTHROPIC_API_KEY", "YOUTUBE_API_KEY", "NEWSDATA_API_KEY", "MEDIASTACK_API_KEY",
  "GUARDIAN_API_KEY", "NYT_API_KEY", "GNEWS_API_KEY", "NEWSAPI_KEY", "X_BEARER_TOKEN",
  "RSS_FEEDS", "ACLED_KEY", "ACLED_EMAIL", "KV_REST_API_URL", "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "META_GRAPH_TOKEN", "IG_USER_ID",
];
const saved: Record<string, string | undefined> = {};
for (const k of CLEAR) saved[k] = process.env[k];

afterEach(() => {
  for (const k of CLEAR) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function clearAll() { for (const k of CLEAR) delete process.env[k]; }

describe("connectionStatus", () => {
  it("keyless sources are always connected", async () => {
    clearAll();
    const { connectionStatus } = await fresh();
    const s = connectionStatus();
    expect(s.find((i) => i.key === "gdelt")?.connected).toBe(true);
    expect(s.find((i) => i.key === "ucdp")?.connected).toBe(true);
    expect(s.find((i) => i.key === "wikipedia")?.connected).toBe(true);
  });

  it("a single-key source connects only when its var is set", async () => {
    clearAll();
    let { connectionStatus } = await fresh();
    expect(connectionStatus().find((i) => i.key === "anthropic")?.connected).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    ({ connectionStatus } = await fresh());
    expect(connectionStatus().find((i) => i.key === "anthropic")?.connected).toBe(true);
  });

  it("a multi-key source needs ALL vars", async () => {
    clearAll();
    process.env.ACLED_KEY = "k";
    let { connectionStatus } = await fresh();
    let acled = connectionStatus().find((i) => i.key === "acled");
    expect(acled?.connected).toBe(false);
    expect(acled?.missing).toEqual(["ACLED_EMAIL"]);
    process.env.ACLED_EMAIL = "a@b.co";
    ({ connectionStatus } = await fresh());
    expect(connectionStatus().find((i) => i.key === "acled")?.connected).toBe(true);
  });

  it("anyOf (KV or Upstash) needs just one", async () => {
    clearAll();
    process.env.UPSTASH_REDIS_REST_URL = "https://x";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const { connectionStatus } = await fresh();
    expect(connectionStatus().find((i) => i.key === "kv")?.connected).toBe(true);
  });
});

describe("connectionSummary", () => {
  it("counts connected and groups by category", async () => {
    clearAll();
    const { connectionSummary } = await fresh();
    const s = connectionSummary();
    expect(s.total).toBeGreaterThan(20);
    expect(s.connected).toBeGreaterThan(0); // keyless ones
    expect(s.connected).toBeLessThan(s.total); // some gated ones missing
    expect(s.byCategory.find((g) => g.category === "Geopolitics & forecast")).toBeTruthy();
  });
});
