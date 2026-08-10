// OSINT tool. Gates: the installed watchlist loads with org/campaign-level
// attribution and cited reporting (no private-person names, rule 1); keyless
// tools are live and gated tools honestly not_configured (rule 7); the report
// compiler enforces the template invariants - BLUF confidence == Section 10 (one
// value), legal confidence word, org-level attribution, honest "Not assessed"
// for missing sections; and the installed .md mirror matches the compiler
// constant (no drift).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { getResolvedRules, getRules, toolStatus, resolveRule } from "@/lib/osint/watchlist";
import { compileReport, validateReport, fillTemplate, looksLikePersonName, type ReportInput } from "@/lib/osint/report";
import { REPORT_TEMPLATE } from "@/lib/osint/template";

describe("watchlist install", () => {
  it("loads the four documented clusters", () => {
    const ids = getRules().map((r) => r.id).sort();
    expect(ids).toEqual(["copycop-fingerprint", "io-apt-coresidence-tripwire", "paperwall-adsense-pivot", "pravda-new-subdomains"]);
  });

  it("attribution is organization/campaign-level with cited reporting - never a private person", () => {
    for (const r of getRules()) {
      expect(r.reporting.length).toBeGreaterThan(0);
      // no bare personal names leaked into attribution (e.g. the CopyCop operator)
      expect(r.attribution.toLowerCase()).not.toMatch(/dougan/);
      expect(looksLikePersonName(r.attribution)).toBe(false);
    }
  });

  it("keyless tools are live; gated tools are honestly not_configured", () => {
    expect(toolStatus("crtsh.certs", {} as any)).toBe("live");
    expect(toolStatus("securitytrails.subdomains", {} as any)).toBe("not_configured");
    expect(toolStatus("securitytrails.subdomains", { SECURITYTRAILS_API_KEY: "x" } as any)).toBe("live");
    expect(toolStatus("unknown.tool", {} as any)).toBe("not_configured");
  });

  it("resolveRule discloses degraded coverage honestly", () => {
    const pravda = getRules().find((r) => r.id === "pravda-new-subdomains")!;
    const resolved = resolveRule(pravda, {} as any); // no keys
    expect(resolved.toolsLive).toContain("crtsh.certs");
    expect(resolved.toolsNotConfigured).toContain("securitytrails.subdomains");
    expect(resolved.coverage).toMatch(/partial|degraded/i);
  });

  it("the tripwire stays low-confidence (clean-negative baseline)", () => {
    expect(getRules().find((r) => r.id === "io-apt-coresidence-tripwire")!.confidence).toBe("low");
  });
});

describe("report compiler - template invariants", () => {
  const base: ReportInput = {
    network_name: "Test Net", date: "2026-08-10", run_id: "r1", mode: "full",
    seed: "example.com", overall_confidence: "Moderate", cluster: "Portal Kombat (Pravda)",
    assessed_actor: "Russia-aligned aggregator network",
  };

  it("BLUF confidence and Section 10 confidence are the SAME value (no drift)", () => {
    const md = fillTemplate(base);
    expect(md).toContain("with Moderate confidence"); // BLUF (Section 1)
    expect(md).toContain("**Moderate confidence**"); // Section 10
    // exactly one confidence word is used in both places - swap it and both move
    const high = fillTemplate({ ...base, overall_confidence: "High" });
    expect(high).toContain("with High confidence");
    expect(high).toContain("**High confidence**");
    expect(high).not.toContain("Moderate confidence");
  });

  it("rejects an illegal confidence word", () => {
    const r = validateReport({ ...base, overall_confidence: "Certain" as any });
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/High \/ Moderate \/ Low/);
  });

  it("rejects a bare personal name as the assessed actor (rule 1)", () => {
    expect(looksLikePersonName("John Mark Dougan")).toBe(true);
    expect(looksLikePersonName("Shenzhen Haimai Media")).toBe(false);
    expect(looksLikePersonName("Undetermined")).toBe(false);
    const r = validateReport({ ...base, assessed_actor: "John Mark Dougan" });
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/organization\/campaign-level/i);
  });

  it("missing narrative sections render an honest 'Not assessed', tables an empty-row marker", () => {
    const md = fillTemplate(base);
    expect(md).toMatch(/Not assessed - insufficient collection/);
    expect(md).toMatch(/no load-bearing rows/);
    expect(md).toContain("Fact and assessment are kept visibly separate");
  });

  it("compiles a valid report end-to-end", () => {
    const c = compileReport({ ...base, executive_summary: "Summary here." });
    expect(c.valid).toBe(true);
    expect(c.violations).toEqual([]);
    expect(c.markdown).toContain("# Influence Operation Investigation: Test Net");
  });
});

describe("installed template mirror stays in sync", () => {
  it("data/osint/report-template.md matches the compiler constant", () => {
    const disk = readFileSync(join(process.cwd(), "data/osint/report-template.md"), "utf8").replace(/\r\n/g, "\n").trimEnd();
    expect(REPORT_TEMPLATE.replace(/\r\n/g, "\n").trimEnd()).toBe(disk);
  });
});
