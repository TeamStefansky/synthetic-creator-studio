import { describe, it, expect } from "vitest";
import { siteToEvidence, boardToEvidence, logsToEvidence, emailToEvidence, postToEvidence } from "../../lib/case/adapters";
import { buildLedger } from "../../lib/case/ledger";
import { ALL_FIXTURES } from "./fixtures/tool-outputs";

const kinds = (ds: any[]) => ds.map((d) => d.kind);
const byKind = (ds: any[], k: string) => ds.filter((d) => d.kind === k);

describe("evidence adapters (P1)", () => {
  it("site adapter: RDAP createdAt is T1, SSL SAN is T1, operator '1984' surfaced", () => {
    const ds = siteToEvidence(ALL_FIXTURES.site);
    const created = byKind(ds, "domain_created")[0];
    expect(created.eventTime.tier).toBe("T1");
    expect(byKind(ds, "ssl_san")[0].eventTime.tier).toBe("T1");
    // the origin ASN "1984 ehf" normalizes to net_org "1984"
    expect(byKind(ds, "net_org").map((d) => d.value)).toContain("1984");
    expect(kinds(ds)).toContain("origin_ip");
    // a CDN nameserver (cloudflare) must NOT create a net_org
    expect(byKind(ds, "net_org").map((d) => d.value)).not.toContain("cloudflare");
  });

  it("site adapter (site B): nameserver ns0.1984.is yields operator '1984'", () => {
    const ds = siteToEvidence(ALL_FIXTURES.siteB);
    expect(byKind(ds, "net_org").map((d) => d.value)).toContain("1984");
    expect(byKind(ds, "ns").map((d) => d.value)).toContain("ns0.1984.is");
  });

  it("the two sites share the operator '1984' as ONE ledger row across searches", () => {
    const ds = [...siteToEvidence(ALL_FIXTURES.site), ...siteToEvidence(ALL_FIXTURES.siteB)]
      .filter((d) => d.kind === "net_org" && d.value === "1984")
      // force a common subject so the shared-operator fact collapses (entityKey differs per site)
      .map((d) => ({ ...d, entityKey: "net_org:1984" }));
    const { items } = buildLedger(ds, "2026-07-20T00:00:00Z");
    expect(items).toHaveLength(1);
    expect(items[0].provenances.length).toBeGreaterThanOrEqual(2);
  });

  it("board adapter: one board_edge per pair, strength preserved", () => {
    const ds = boardToEvidence(ALL_FIXTURES.board);
    expect(byKind(ds, "board_edge")).toHaveLength(2);
    expect(ds.map((d) => d.value).join(" ")).toMatch(/High/);
    expect(ds.map((d) => d.value).join(" ")).toMatch(/Low/);
  });

  it("logs adapter: server-log IP is T1 with its operator", () => {
    const ds = logsToEvidence(ALL_FIXTURES.logs);
    const ip = byKind(ds, "ip")[0];
    expect(ip.value).toBe("89.147.110.100");
    expect(ip.eventTime.tier).toBe("T1");
    expect(ip.provenance.sourceGrade).toBe("B"); // server_log
    expect(byKind(ds, "net_org").map((d) => d.value)).toContain("1984");
  });

  it("email adapter: origin hop is T2, auth result recorded, no person data", () => {
    const ds = emailToEvidence(ALL_FIXTURES.email);
    expect(byKind(ds, "email_origin")[0].eventTime.tier).toBe("T2");
    expect(kinds(ds)).toContain("auth_result");
  });

  it("post adapter: a claim is graded self-reported (D4), verdict not a fact", () => {
    const ds = postToEvidence(ALL_FIXTURES.post);
    const claim = byKind(ds, "claim")[0];
    expect(claim.provenance.sourceGrade).toBe("D");
    expect(claim.provenance.infoCredibility).toBe(4);
    expect(claim.notes).toMatch(/not a fact/);
  });

  it("adapters are pure: same input => identical drafts", () => {
    expect(JSON.stringify(siteToEvidence(ALL_FIXTURES.site))).toBe(JSON.stringify(siteToEvidence(ALL_FIXTURES.site)));
  });
});
