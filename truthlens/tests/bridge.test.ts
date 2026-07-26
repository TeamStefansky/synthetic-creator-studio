import { describe, it, expect } from "vitest";
import { deepenAmplifiers } from "../lib/bridge";
import type { DomainIntel } from "../lib/narrative/types";

const intel = (over: Partial<DomainIntel> & { domain: string }): DomainIntel => ({ count: 1, ...over });

describe("infra<->narrative bridge: deepenAmplifiers (narrative -> infra)", () => {
  it("returns undefined when no amplifier resolved to an ASN", async () => {
    const r = await deepenAmplifiers([intel({ domain: "a.example" }), intel({ domain: "b.example" })]);
    expect(r).toBeUndefined();
  });

  it("builds an amplifier->operator graph and finds operators shared by 2+ domains", async () => {
    const r = await deepenAmplifiers([
      intel({ domain: "a.example", asn: "AS111", asnOrg: "Op One" }),
      intel({ domain: "b.example", asn: "AS111", asnOrg: "Op One" }),
      intel({ domain: "c.example", asn: "AS222", asnOrg: "Op Two" }),
    ]);
    expect(r).toBeDefined();
    // 3 domain nodes + 2 operator nodes
    expect(r!.network.nodes.filter((n) => n.kind === "domain")).toHaveLength(3);
    expect(r!.network.nodes.filter((n) => /^host\/operator:/.test(n.label))).toHaveLength(2);
    expect(r!.operatorCount).toBe(2);
    // AS111 is shared by two amplifiers → connective tissue
    expect(r!.sharedOperators).toHaveLength(1);
    expect(r!.sharedOperators[0].asn).toBe("AS111");
    expect(r!.sharedOperators[0].domains.sort()).toEqual(["a.example", "b.example"]);
  });

  it("attaches an operator-reputation assessment (sanctions honest not-connected without a key)", async () => {
    const r = await deepenAmplifiers([intel({ domain: "a.example", asn: "AS111", asnOrg: "Some Neutral Host Ltd" })]);
    expect(r!.reputation).toBeDefined();
    expect(r!.reputation.sanctions.connected).toBe(false); // no OPENSANCTIONS_API_KEY in test env
  });
});
