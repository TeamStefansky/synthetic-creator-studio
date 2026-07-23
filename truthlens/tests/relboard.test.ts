// Relationship Board - the pure, deterministic core. Gates:
//  - validation enforces provenance (>=1 source) and referential integrity;
//  - person/dossier fields are structurally stripped (no bio/photo/etc. survive);
//  - CSV export referential integrity (every edge id exists in nodes.csv);
//  - GraphML is well-formed XML with directed edges.

import { describe, it, expect } from "vitest";
import { validateRelGraph } from "../lib/relboard/schema";
import { toNodesCsv, toEdgesCsv, toGraphml } from "../lib/relboard/export";

const bil = (en: string) => ({ he: en, en });
const src = () => [{ title: "10-K", url: "https://www.sec.gov/x", publisher: "SEC", retrievedAt: "2026-07-23" }];

const rawValid = {
  company: "Acme",
  centralNodeId: "org-acme",
  nodes: [
    { id: "org-acme", type: "organization", name: "Acme Corp", label: bil("HQ"), confidence: 0.95, confidenceReason: bil("public co"), sources: src() },
    { id: "org-parent", type: "organization", name: "Acme Holdings", label: bil("Parent"), confidence: 0.8, confidenceReason: bil("filing"), sources: src() },
    { id: "role-ceo", type: "role", name: "Chief Executive", label: bil("CEO"), orgName: "Acme Corp", confidence: 0.7, confidenceReason: bil("press"), sources: src() },
  ],
  edges: [
    { id: "e1", source: "org-parent", target: "org-acme", type: "parent", label: bil("parent of"), confidence: 0.8 },
    { id: "e2", source: "role-ceo", target: "org-acme", type: "officer_role", label: bil("leads"), confidence: 0.7 },
  ],
};

describe("validateRelGraph", () => {
  it("accepts a well-formed org graph", () => {
    const r = validateRelGraph(rawValid, "Acme");
    expect(r.ok).toBe(true);
    expect(r.graph!.nodes).toHaveLength(3);
    expect(r.graph!.edges).toHaveLength(2);
    expect(r.graph!.centralNodeId).toBe("org-acme");
  });

  it("rejects a node with no source (provenance mandatory)", () => {
    const raw = { ...rawValid, nodes: [{ ...rawValid.nodes[0], sources: [] }] };
    const r = validateRelGraph(raw, "Acme");
    expect(r.ok).toBe(false);
  });

  it("drops edges that reference a missing node (referential integrity)", () => {
    const raw = { ...rawValid, edges: [...rawValid.edges, { id: "bad", source: "org-acme", target: "ghost", type: "partner", label: bil("x"), confidence: 0.5 }] };
    const r = validateRelGraph(raw, "Acme");
    expect(r.graph!.edges.map((e) => e.id)).not.toContain("bad");
  });

  it("keeps a disclosed officeholder name but strips every other personal field", () => {
    const raw = {
      ...rawValid,
      nodes: [{
        ...rawValid.nodes[2],
        officeholder: "Jane Doe", // the ONE allowed personal datum (cited public role)
        bio: bil("a person biography"), photoUrl: "https://x/p.jpg", address: "1 Main St",
        phone: "+1", email: "a@b.co", family: "spouse", notableActivity: [bil("did a thing")],
        age: 51, birthDate: "1974-01-01",
      }],
    };
    const r = validateRelGraph(raw, "Acme");
    expect(r.ok).toBe(true);
    const role = r.graph!.nodes.find((n) => n.id === "role-ceo")!;
    expect(role.type).toBe("role");
    expect(role.officeholder).toBe("Jane Doe"); // disclosed role fact kept
    const json = JSON.stringify(r.graph);
    for (const forbidden of ["biography", "p.jpg", "Main St", "@b.co", "spouse", "did a thing", "1974"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("does not attach an officeholder to an organization node", () => {
    const raw = { ...rawValid, nodes: [{ ...rawValid.nodes[0], officeholder: "Should Not Appear" }] };
    const r = validateRelGraph(raw, "Acme");
    expect(JSON.stringify(r.graph)).not.toContain("Should Not Appear");
  });

  it("de-duplicates nodes sharing an id", () => {
    const raw = { ...rawValid, nodes: [...rawValid.nodes, rawValid.nodes[0]] };
    const r = validateRelGraph(raw, "Acme");
    expect(r.graph!.nodes.filter((n) => n.id === "org-acme")).toHaveLength(1);
  });
});

describe("graph export", () => {
  const g = validateRelGraph(rawValid, "Acme").graph!;

  it("edges.csv references only ids present in nodes.csv", () => {
    const nodeIds = new Set(toNodesCsv(g).split("\n").slice(1).map((r) => r.split(",")[0]));
    const edgeRows = toEdgesCsv(g).split("\n").slice(1);
    for (const row of edgeRows) {
      const [srcId, tgtId] = row.split(",");
      expect(nodeIds.has(srcId)).toBe(true);
      expect(nodeIds.has(tgtId)).toBe(true);
    }
  });

  it("nodes.csv escapes commas/quotes (RFC-4180)", () => {
    const g2 = validateRelGraph({
      ...rawValid,
      nodes: [{ ...rawValid.nodes[0], name: 'Acme, "The" Corp', confidenceReason: bil("a, b") }],
    }, "Acme").graph!;
    const line = toNodesCsv(g2).split("\n")[1];
    expect(line).toContain('"Acme, ""The"" Corp"');
  });

  it("GraphML is well-formed, directed XML with all nodes + edges", () => {
    const xml = toGraphml(g);
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain('edgedefault="directed"');
    expect((xml.match(/<node /g) || []).length).toBe(g.nodes.length);
    expect((xml.match(/<edge /g) || []).length).toBe(g.edges.length);
    // balanced tags for the elements we emit
    expect((xml.match(/<node /g) || []).length).toBe((xml.match(/<\/node>/g) || []).length);
    expect((xml.match(/<graphml/g) || []).length).toBe((xml.match(/<\/graphml>/g) || []).length);
  });

  it("escapes XML special chars in GraphML", () => {
    const g3 = validateRelGraph({ ...rawValid, nodes: [{ ...rawValid.nodes[0], name: "A & B <Corp>" }] }, "Acme").graph!;
    const xml = toGraphml(g3);
    expect(xml).toContain("A &amp; B &lt;Corp&gt;");
  });
});

import { extractJson, autoClose } from "../lib/relboard/json";

describe("extractJson (truncation repair)", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips markdown fences and surrounding prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\ndone')).toEqual({ a: 1 });
  });
  it("salvages JSON truncated by the token limit", () => {
    // a graph cut off mid-array/mid-object (no closing brackets)
    const truncated = '{"company":"Nike","nodes":[{"id":"org-nike","name":"Nike","label":{"he":"נייקי","en":"Nike"';
    const out = extractJson(truncated);
    expect(out).toBeTruthy();
    expect(out.company).toBe("Nike");
    expect(Array.isArray(out.nodes)).toBe(true);
  });
  it("closes an open string + brackets via autoClose", () => {
    expect(() => JSON.parse(autoClose('{"a":"unterminated'))).not.toThrow();
  });
  it("returns null when there is no JSON at all", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});
