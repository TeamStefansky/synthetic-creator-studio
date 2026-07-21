// P5 - evidence archival (Save Page Now). Network is stubbed via global fetch so
// the pure orchestration is testable: cap, dedup, non-http skipping, honest
// archived/requested status, and per-URL caching (no double-trigger same day).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { archiveEvidence, saveToArchive } from "../lib/archive";

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => any) {
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input);
    return handler(url);
  }) as any;
}
function jsonRes(body: any) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { globalThis.fetch = realFetch; });

describe("archiveEvidence", () => {
  it("caps at 10, dedupes, and skips non-http URLs", async () => {
    const saved = new Set<string>();
    stubFetch((url) => {
      if (url.includes("/save/")) { saved.add(url); return jsonRes({}); }
      // availability API: report not archived → status 'requested'
      return jsonRes({ archived_snapshots: {} });
    });
    const urls = [
      ...Array.from({ length: 15 }, (_, i) => `https://ex.com/${i}`),
      "https://ex.com/0", // duplicate
      "not-a-url", "ftp://x/y", undefined,
    ];
    const links = await archiveEvidence(urls);
    expect(links.length).toBe(10); // capped
    expect(new Set(links.map((l) => l.url)).size).toBe(10); // unique
    expect(links.every((l) => l.url.startsWith("https://"))).toBe(true);
  });

  it("returns status 'archived' with the snapshot URL when availability confirms one", async () => {
    stubFetch((url) => {
      if (url.includes("/save/")) return jsonRes({});
      return jsonRes({ archived_snapshots: { closest: { available: true, url: "http://web.archive.org/web/20240101/https://ex.com/a", timestamp: "20240101" } } });
    });
    const [link] = await archiveEvidence(["https://ex.com/a"]);
    expect(link.status).toBe("archived");
    expect(link.archiveUrl).toBe("https://web.archive.org/web/20240101/https://ex.com/a"); // https-normalized
    expect(link.timestamp).toBe("20240101");
  });

  it("returns status 'requested' (never faking a snapshot) when none is confirmed", async () => {
    stubFetch((url) => (url.includes("/save/") ? jsonRes({}) : jsonRes({ archived_snapshots: {} })));
    const [link] = await archiveEvidence(["https://ex.com/pending"]);
    expect(link.status).toBe("requested");
    expect(link.archiveUrl).toContain("web.archive.org/web/*/");
  });

  it("is failure-isolated: a save throwing does not abort the batch", async () => {
    stubFetch((url) => {
      if (url.includes("/save/")) throw new Error("network down");
      return jsonRes({ archived_snapshots: {} });
    });
    const links = await archiveEvidence(["https://ex.com/x", "https://ex.com/y"]);
    expect(links.length).toBe(2);
    expect(links.every((l) => l.status === "requested")).toBe(true);
  });

  it("caches per URL (no second Save Page Now trigger for the same URL)", async () => {
    let saveCalls = 0;
    stubFetch((url) => {
      if (url.includes("/save/")) { saveCalls++; return jsonRes({}); }
      return jsonRes({ archived_snapshots: {} });
    });
    // Genuinely unique per run so the persistent on-disk cache never pre-seeds it.
    const u = `https://ex.com/cache-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    await saveToArchive(u);
    await saveToArchive(u);
    expect(saveCalls).toBe(1); // second call served from cache
  });

  it("skips a fully empty/invalid input set", async () => {
    stubFetch(() => jsonRes({}));
    expect(await archiveEvidence([undefined, "nope", "mailto:a@b.c"])).toEqual([]);
  });
});
