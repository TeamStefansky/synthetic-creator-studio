import { describe, it, expect } from "vitest";
import { assessOperatorReputation, sanctionConfidence } from "../lib/operator-reputation";

describe("operator reputation (Site Report + Link Board)", () => {
  it("normalizes operators from asnOrg + nameservers and lists co-hosted infrastructure", async () => {
    const rep = await assessOperatorReputation({
      asnOrgs: ["1984 ehf", undefined],
      nameserverHosts: ["ns0.1984.is", "ns1.virtualroad.info"],
      coHosted: ["a.example", "b.example", "c.example"],
    });
    expect(rep.operators).toContain("1984");
    expect(rep.asnOrg).toBe("1984 ehf");
    expect(rep.coHostedCount).toBe(3);
    expect(rep.coHostedSample.length).toBeGreaterThan(0);
  });

  it("sanctions screening shows an honest not-connected state without a key", async () => {
    const rep = await assessOperatorReputation({ asnOrgs: ["Some Host Ltd"], coHosted: [] });
    // No OPENSANCTIONS_API_KEY in test env => honest not-connected, never faked.
    expect(rep.sanctions.connected).toBe(false);
    expect(rep.sanctions.hits).toBe(0);
  });

  it("a clean result is valid and does not certify the operator", async () => {
    const rep = await assessOperatorReputation({ asnOrgs: ["Neutral Host"], coHosted: ["x.example"] });
    expect(rep.flags).toHaveLength(0); // empty neutral reference lists => no match
    expect(rep.note).toMatch(/clean result is common|does not certify/i);
  });

  it("mega-providers do not become an operator token (Cloudflare/Google filtered)", async () => {
    const rep = await assessOperatorReputation({ asnOrgs: ["Cloudflare, Inc."], nameserverHosts: ["ns.google.com"], coHosted: [] });
    expect(rep.operators).toHaveLength(0);
  });

  it("prefers the real operator over a CDN frontend for display + screening", async () => {
    const rep = await assessOperatorReputation({ asnOrgs: ["Google LLC", "1984 ehf"], coHosted: [] });
    expect(rep.asnOrg).toBe("1984 ehf");           // NOT "Google LLC"
    expect(rep.asnOrgIsFrontend).toBeFalsy();
  });

  it("labels a CDN-only frontend as a frontend, never the operator", async () => {
    const rep = await assessOperatorReputation({ asnOrgs: ["Cloudflare, Inc."], coHosted: [] });
    expect(rep.asnOrg).toBe("Cloudflare, Inc.");   // shown for transparency
    expect(rep.asnOrgIsFrontend).toBe(true);       // but flagged as frontend, not operator
  });
});

describe("sanctions match quality (no garbage fuzzy hits)", () => {
  it("drops weak fuzzy matches below the surface threshold", () => {
    expect(sanctionConfidence(0.6, "Organization")).toBeNull();
    expect(sanctionConfidence(0.84, "Company")).toBeNull();
  });
  it("scores strong org matches by score", () => {
    expect(sanctionConfidence(0.86, "Organization")).toBe("Medium");
    expect(sanctionConfidence(0.95, "Company")).toBe("High");
  });
  it("an org-name matching a Person needs near-exact and is never High", () => {
    expect(sanctionConfidence(0.9, "Person")).toBeNull();     // e.g. 'Google LLC' -> a person
    expect(sanctionConfidence(0.96, "Person")).toBe("Medium"); // near-exact, still capped
  });
  it("a null score cannot assert strength on its own", () => {
    expect(sanctionConfidence(null, "Organization")).toBeNull();
  });
});
