import { describe, it, expect } from "vitest";
import { recordAmplifiers, lookupAmplifiers } from "../lib/evidence-store";
import { crossLookup } from "../lib/bridge";

describe("shared evidence store (KV-gated, honest not-connected)", () => {
  it("is an honest no-op / not-connected without KV (never faked)", async () => {
    // No KV env in tests → storeAvailable() is false.
    await recordAmplifiers("Acme", ["a.example", "b.example"], "2026-07-26T00:00:00Z"); // no throw
    const r = await lookupAmplifiers(["a.example"]);
    expect(r.connected).toBe(false);
    expect(Object.keys(r.hits)).toHaveLength(0);
  });
});

describe("infra -> narrative crossLookup", () => {
  it("flags a seeded state-media domain among a site's domains, with a citation + alternative", async () => {
    const r = await crossLookup(["innocent.example", "rt.com", "another.example"]);
    const sm = r.hits.find((h) => h.kind === "state_media" && h.domain === "rt.com");
    expect(sm).toBeDefined();
    expect(sm!.citation).toMatch(/^https?:\/\//);        // cited
    expect(sm!.alternative.length).toBeGreaterThan(0);   // innocent alternative always present
  });

  it("returns no hits for domains with no documented/monitored connection", async () => {
    const r = await crossLookup(["nothing-here.example", "also-clean.example"]);
    expect(r.hits).toHaveLength(0);
    expect(r.checked).toBe(2);
    expect(r.registryConnected).toBe(false); // no KV in tests
  });
});
