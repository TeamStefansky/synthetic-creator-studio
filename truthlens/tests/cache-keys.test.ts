// Cache keys must be injective. The filesystem-safe key used to collapse every
// non-[a-z0-9._-] character to "_", so two different Hebrew/Arabic/Cyrillic
// queries of equal length shared one entry and one entity's mentions were served
// for another. TruthLens is multilingual - distinct keys must stay distinct.

import { describe, it, expect } from "vitest";
import { cacheGet, cacheSet } from "@/lib/cache";

describe("cache key safety", () => {
  it("distinct non-Latin keys of equal length never collide", async () => {
    await cacheSet("mentions-raw:ישראל עזה", { who: "a" });
    expect(await cacheGet("mentions-raw:חמאס גדהה")).toBeNull();
    expect(await cacheGet("mentions-raw:Россия ЕС")).toBeNull();
    expect(await cacheGet<{ who: string }>("mentions-raw:ישראל עזה")).toEqual({ who: "a" });
  });
  it("case and punctuation differences stay distinct", async () => {
    await cacheSet("q:Acme Corp", 1);
    expect(await cacheGet("q:acme corp")).toBeNull();
    expect(await cacheGet("q:Acme_Corp")).toBeNull();
  });
  it("plain ASCII keys are unchanged (existing on-disk entries stay valid)", async () => {
    await cacheSet("bsky-created:did_plc_abc", "2024-01-01");
    expect(await cacheGet("bsky-created:did_plc_abc")).toBe("2024-01-01");
  });
});
