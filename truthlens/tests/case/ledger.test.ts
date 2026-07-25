import { describe, it, expect } from "vitest";
import {
  buildLedger, contentHashOf, corroborationWeight, evidenceId, normalizeValue,
  supersede, verifyContentHash, assignLineageIds,
} from "../../lib/case/ledger";
import { mkProvenance } from "../../lib/case/adapters/util";
import type { EvidenceDraft } from "../../lib/case/types";

const prov = (sourceClass: string, lineageId: string, sourceUrl?: string, bytes?: string) =>
  mkProvenance({ sourceClass, lineageId, sourceUrl, bytes, collectedAt: "2026-07-20T00:00:00Z" });

const d = (kind: any, entityKey: string, value: string, p: ReturnType<typeof prov>, eventTime?: any): EvidenceDraft =>
  ({ kind, entityKey, value, provenance: p, eventTime });

describe("case ledger — custody, dedup, corroboration (P1)", () => {
  it("id is deterministic and excludes sourceUrl", () => {
    const a = evidenceId("ga_id", "domain:x.com", normalizeValue("G-ABC"));
    const b = evidenceId("ga_id", "domain:x.com", normalizeValue("g-abc")); // normalized upstream
    expect(a).toBe(b);
  });

  it("same fact from two tools collapses to one row with two provenances", () => {
    const drafts = [
      d("net_org", "domain:x.com", "1984", prov("ip_enrichment", "lin:A", "https://a")),
      d("net_org", "domain:x.com", "1984", prov("rdap", "lin:B", "https://b")),
    ];
    const { items } = buildLedger(drafts, "2026-07-20T00:00:00Z");
    expect(items).toHaveLength(1);
    expect(items[0].provenances).toHaveLength(2);
    // two INDEPENDENT lineages => corroboration weight 2 (doctrine: independence = corroboration)
    expect(corroborationWeight(items[0])).toBe(2);
  });

  it("syndicated copies (one lineage) score as ONE corroboration", () => {
    const wire = "Breaking: the ministry confirmed the policy today.";
    const texts = new Array(6).fill(wire);
    const lineages = assignLineageIds(texts, "wire");
    expect(new Set(lineages).size).toBe(1); // six near-dup outlets => one lineage
    const drafts = texts.map((t, i) => d("claim", "post:story", wire, prov("self_byline", lineages[i], `https://outlet${i}`, t)));
    const { items } = buildLedger(drafts, "2026-07-20T00:00:00Z");
    expect(items).toHaveLength(1);
    expect(items[0].provenances).toHaveLength(6);
    expect(corroborationWeight(items[0])).toBe(1); // six outlets, one wire => one source
  });

  it("merging keeps the better time tier (T1 over T4)", () => {
    const drafts = [
      d("domain_created", "domain:x.com", "2023-01-01T00:00:00Z", prov("wayback", "lin:w"), { at: "2026-07-20T00:00:00Z", tier: "T4", bound: "upper" }),
      d("domain_created", "domain:x.com", "2023-01-01T00:00:00Z", prov("rdap", "lin:r"), { at: "2023-01-01T00:00:00Z", tier: "T1", bound: "point" }),
    ];
    const { items } = buildLedger(drafts, "2026-07-20T00:00:00Z");
    expect(items[0].eventTime?.tier).toBe("T1");
  });

  it("content hash is stable and verifiable", () => {
    const h = contentHashOf("hello bytes");
    expect(h).toHaveLength(64);
    expect(verifyContentHash("hello bytes", h)).toBe(true);
    expect(verifyContentHash("tampered", h)).toBe(false);
  });

  it("unknown source class defaults to F6, never a guessed middle grade", () => {
    const p = prov("totally-unknown-source", "lin:x");
    expect(p.sourceGrade).toBe("F");
    expect(p.infoCredibility).toBe(6);
  });

  it("corrections supersede (append-only) — the old record is never removed", () => {
    const { byId, items } = buildLedger([d("registrar", "domain:x.com", "OldReg", prov("rdap", "lin:r"))], "2026-07-20T00:00:00Z");
    const oldId = items[0].id;
    const replacement = { ...items[0], id: "new123", value: "NewReg", normalizedValue: "newreg" };
    const next = supersede({ byId, items }, oldId, replacement as any);
    expect(next.byId[oldId].state).toBe("superseded");   // old kept, marked
    expect(next.byId["new123"].supersedes).toBe(oldId);
    expect(next.items.some((i) => i.id === oldId)).toBe(true);
  });

  it("determinism: identical drafts + version => identical ledger", () => {
    const mk = () => buildLedger([d("ip", "domain:x.com", "1.2.3.4", prov("ip_enrichment", "lin:a"))], "2026-07-20T00:00:00Z");
    expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()));
  });
});
