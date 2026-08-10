import { describe, it, expect } from "vitest";
import { scoreSignature, effortAsymmetry } from "../../lib/case/signature";
import { subtractBaseline, isBaselineExplained } from "../../lib/case/baseline";
import { assessDeception } from "../../lib/case/deception";
import { orderByVolatility, dualTool, volatilityRank } from "../../lib/agent/collect-order";
import { STRENGTH_RANK } from "../../lib/case/cluster";

describe("method vs signature (06·P5)", () => {
  it("SIGNATURE scenario: MO-only scores below a residual signature match", () => {
    const moOnly = scoreSignature([{ name: "cloudflare-hosting", isSignature: false }, { name: "same-registrar", isSignature: false }], {});
    const signature = scoreSignature([{ name: "recurring-error-string-x123", isSignature: true }], { cdn: "cloudflare" });
    expect(STRENGTH_RANK[signature.strength]).toBeGreaterThan(STRENGTH_RANK[moOnly.strength]);
    expect(signature.alternative).toMatch(/shared tooling|shared templates/i); // innocence covered
  });
});

describe("processing baseline gate - the second headline (06·P5)", () => {
  it("BASELINE scenario: same-CDN/same-optimizer shared quirks credit NO signature strength", () => {
    const toolchain = { cdn: "cloudflare", imagePipeline: "cloudinary" };
    const score = scoreSignature([
      { name: "minified-html", isSignature: true },   // imposed by Cloudflare on everyone
      { name: "reencode-q-auto", isSignature: true },  // imposed by Cloudinary on everyone
    ], toolchain);
    expect(score.creditedSignature).toHaveLength(0);   // baseline absorbed both
    expect(score.baselineAbsorbed.length).toBe(2);
    expect(score.strength).toBe("Unknown");            // no link forms from toolchain artifacts
  });

  it("removing the baseline gate is what carries it: a residual feature IS credited", () => {
    const score = scoreSignature([{ name: "operator-typo-teh-govermnet", isSignature: true }], { cdn: "cloudflare" });
    expect(score.creditedSignature).toContain("operator-typo-teh-govermnet");
    expect(score.strength).toBe("High");
  });

  it("an unknown toolchain treats a feature as baseline-explained until shown otherwise", () => {
    expect(isBaselineExplained("anything", {})).toBe(true);
    expect(subtractBaseline(["anything"], {})).toHaveLength(0);
  });
});

describe("staging detection via effort asymmetry (06·P5)", () => {
  it("effort asymmetry is a positive MOM-POP indicator that lets deception rise", () => {
    expect(effortAsymmetry({ privacyProtection: true, infraSeparation: true, contentHygiene: true, metadataStripping: false, convenientlyExposed: 1 })).toBe(true);
    const d = assessDeception({ staging: { effortAsymmetry: true } });
    expect(d.positiveMomPop).toBe(true); // staging alone supplies MOM + POP
    expect(d.notes.join(" ")).toMatch(/effort asymmetry/);
  });
  it("no asymmetry (uniformly sloppy) does not raise deception", () => {
    expect(effortAsymmetry({ privacyProtection: false, infraSeparation: false, contentHygiene: false, metadataStripping: false, convenientlyExposed: 3 })).toBe(false);
  });
});

describe("order of volatility + dual-tool (06·P5)", () => {
  it("VOLATILITY scenario: perishable capture runs first even at lower diagnosticity", () => {
    const ordered = orderByVolatility([
      { volatility: "registry", diagnosticity: 0.9, id: "registry" },
      { volatility: "live_content", diagnosticity: 0.1, id: "live" },
    ]);
    expect(ordered[0].id).toBe("live");                 // volatility overrides diagnosticity
    expect(volatilityRank("live_content")).toBeLessThan(volatilityRank("archive"));
  });

  it("DUAL-TOOL scenario: two resolvers disagreeing makes the disagreement the finding", () => {
    const r = dualTool("resolver-A", "resolver-B", "1.2.3.4", "5.6.7.8");
    expect(r.agree).toBe(false);
    expect(r.finding).toMatch(/TOOLS DISAGREE/);
  });
});
