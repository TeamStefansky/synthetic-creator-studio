import { describe, it, expect } from "vitest";
import { CHARACTERISTIC, CALIBRATION, isIndividualCharacteristic, rungForCharacteristics } from "../../lib/board/calibrate";
import { ALL_BOARD_ARTIFACT_KINDS } from "../../lib/board/types";
import { buildClusters, type StrengthEdge } from "../../lib/case/cluster";
import { synthesizeCase } from "../../lib/case/synthesize";

describe("class vs individual characteristics (06·P1)", () => {
  it("SCHEMA: every board artifact kind is classified (none defaults silently)", () => {
    for (const k of ALL_BOARD_ARTIFACT_KINDS) {
      expect(CHARACTERISTIC[k], `missing characteristic for ${k}`).toBeDefined();
      expect(["class", "individual"]).toContain(CHARACTERISTIC[k].characteristicClass);
      expect(CHARACTERISTIC[k].provenance.length).toBeGreaterThan(0);
    }
    // and it stays in lockstep with the calibration table
    expect(Object.keys(CHARACTERISTIC).sort()).toEqual(Object.keys(CALIBRATION).sort());
  });

  it("infra features are class; account/identity features are individual", () => {
    expect(isIndividualCharacteristic("asn")).toBe(false);
    expect(isIndividualCharacteristic("registrar")).toBe(false);
    expect(isIndividualCharacteristic("hosting_country")).toBe(false);
    expect(isIndividualCharacteristic("ga_id")).toBe(true);
    expect(isIndividualCharacteristic("ssl_san")).toBe(true);
  });

  it("any number of class characteristics can never reach common-operation", () => {
    const eightClass = ["asn", "as_org", "registrar", "ns_set", "hosting_country", "cms", "server_header", "framework"] as const;
    expect(rungForCharacteristics([...eightClass])).toBe("association");
    expect(rungForCharacteristics(["ga_id"])).toBe("common-operation"); // one individual suffices
  });

  it("HEADLINE: 8 shared class features => no cluster, no common-operation, capped at association", () => {
    const classEdges: StrengthEdge[] = [
      { a: "x.com", b: "y.com", strength: "Medium", characteristic: "class", evidenceId: "asn" },
      { a: "x.com", b: "y.com", strength: "Medium", characteristic: "class", evidenceId: "registrar" },
    ];
    const clusters = buildClusters(["x.com", "y.com"], classEdges);
    expect(clusters.filter((c) => c.members.length > 1)).toHaveLength(0); // class-only never forms a cluster
    const cf = synthesizeCase({ entities: ["x.com", "y.com"], boardEdges: classEdges, enteredCaseAt: "2026-01-01T00:00:00Z" });
    expect(cf.bottomLine.rung).toBe("association");
  });

  it("an individual characteristic DOES form a cluster and reaches common-operation", () => {
    const indEdge: StrengthEdge[] = [{ a: "x.com", b: "y.com", strength: "High", characteristic: "individual", evidenceId: "ga" }];
    const clusters = buildClusters(["x.com", "y.com"], indEdge);
    expect(clusters.find((c) => c.members.includes("x.com"))!.members.sort()).toEqual(["x.com", "y.com"]);
    const cf = synthesizeCase({ entities: ["x.com", "y.com"], boardEdges: indEdge, enteredCaseAt: "2026-01-01T00:00:00Z" });
    expect(cf.bottomLine.rung).toBe("common-operation");
  });
});
