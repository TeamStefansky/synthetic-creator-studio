import { describe, it, expect } from "vitest";
import { buildOperatorGraph } from "../lib/network";
import { buildLinkNetwork } from "../lib/board/links";
import type { Fingerprint } from "../lib/board/types";

const fp = (over: Partial<Fingerprint> & { entity: string }): Fingerprint => ({
  artifacts: [], neighborCount: null, cdn: false, wildcardCertOrCdnIssuer: false, errors: [], ...over,
});

describe("buildOperatorGraph (shared operator-graph builder)", () => {
  it("links a domain to its IP, dedicated neighbours, SAN, GA and AdSense nodes", () => {
    const g = buildOperatorGraph([{
      domain: "a.example", ip: "1.2.3.4", neighbors: ["b.example"], ipIsShared: false,
      sans: ["c.example"], gaIds: ["UA-1"], adsenseIds: ["ca-pub-9"],
    }]);
    const reasons = g.edges.map((e) => e.reason);
    expect(reasons).toContain("hosted on IP");
    expect(reasons).toContain("shared dedicated IP");
    expect(reasons).toContain("shared SSL certificate (SAN)");
    expect(reasons).toContain("Google Analytics ID");
    expect(reasons).toContain("AdSense ID");
    expect(g.hiddenSharedIpCount).toBe(0);
  });

  it("hides co-tenants on a shared IP and counts them (never links them)", () => {
    const g = buildOperatorGraph([{ domain: "a.example", ip: "1.2.3.4", neighbors: ["x.example", "y.example"], ipIsShared: true }]);
    expect(g.hiddenSharedIpCount).toBe(2);
    expect(g.edges.some((e) => e.reason === "shared dedicated IP")).toBe(false);
    expect(g.edges.some((e) => e.reason === "hosted on IP")).toBe(true); // own IP still shown
  });

  it("merges two domains that share an IP into ONE connected graph, edges deduped", () => {
    const g = buildOperatorGraph([
      { domain: "a.example", ip: "9.9.9.9", ipIsShared: false, gaIds: ["UA-SHARED"] },
      { domain: "b.example", ip: "9.9.9.9", ipIsShared: false, gaIds: ["UA-SHARED"] },
    ]);
    // one shared IP node + one shared GA node → a and b are connected through them
    expect(g.nodes.filter((n) => n.kind === "ip")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.kind === "ga")).toHaveLength(1);
    const keys = g.edges.map((e) => `${e.source}|${e.target}|${e.reason}`);
    expect(new Set(keys).size).toBe(keys.length); // no duplicate edges
  });

  it("flags known-fake domains only when a predicate is supplied", () => {
    const withFlag = buildOperatorGraph([{ domain: "bad.example", ipIsShared: false }], (d) => d === "bad.example");
    expect(withFlag.nodes.find((n) => n.id === "bad.example")!.flaggedFake).toBe(true);
    const noFlag = buildOperatorGraph([{ domain: "bad.example", ipIsShared: false }]);
    expect(noFlag.nodes.find((n) => n.id === "bad.example")!.flaggedFake).toBe(false);
  });
});

describe("buildLinkNetwork (N-domain adapter)", () => {
  it("connects two board domains via a shared GA id and never flags fake", () => {
    const net = buildLinkNetwork([
      fp({ entity: "a.example", ip: "5.5.5.5", gaIds: ["UA-Z"] }),
      fp({ entity: "b.example", ip: "5.5.5.5", gaIds: ["UA-Z"] }),
    ]);
    expect(net.nodes.filter((n) => n.kind === "ga")).toHaveLength(1);
    expect(net.nodes.filter((n) => n.kind === "ip")).toHaveLength(1);
    // board keeps its no-flag behaviour (predicate omitted)
    expect(net.nodes.every((n) => n.flaggedFake === false)).toBe(true);
  });
});
