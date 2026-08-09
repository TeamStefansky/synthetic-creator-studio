// Host-conduct layer. Gates: a documented host (1984/AS44925) matches by ASN and
// by operator alias, and its findings carry citations at High confidence; the
// co-hosted extremist flag is SEPARATED (never merged into a client claim); a
// domain name is flagged with the name≠content caveat; an unknown host is
// "not assessed" (Unknown), never "clean"; the classifier is high-precision.

import { describe, it, expect } from "vitest";
import { buildHostConduct, matchHost, hostConductCount } from "@/lib/host-conduct";
import { classifyDomainCharacter, groupByCharacter, NAME_NOT_CONTENT } from "@/lib/host-conduct/classify";

describe("classifyDomainCharacter", () => {
  it("flags a neo-Nazi name as extremist, with the name≠content caveat", () => {
    const r = classifyDomainCharacter("hitler.nu");
    expect(r.character).toBe("extremist");
    expect(r.caveat).toBe(NAME_NOT_CONTENT);
  });
  it("high precision: ordinary names are neutral (no false extremist flags)", () => {
    expect(classifyDomainCharacter("localbakery.com").character).toBe("neutral");
    expect(classifyDomainCharacter("scientistrebellion.is").character).toBe("activism");
    expect(classifyDomainCharacter("privacymint.com").character).toBe("privacy");
  });
  it("groups a sweep, extremist first, neutrals counted not listed", () => {
    const g = groupByCharacter(["hitler.nu", "shop.com", "anarchistivory.com", "gnuhacker.org", "news.com"]);
    expect(g.extremist.map((e) => e.domain)).toEqual(["hitler.nu"]);
    expect(g.privacy.length).toBe(1);
    expect(g.activism.length).toBe(1);
    expect(g.neutralCount).toBe(2);
    expect(g.total).toBe(5);
  });
});

describe("matchHost", () => {
  it("matches the documented host by ASN", () => {
    expect(matchHost({ asn: "AS44925" })?.org).toBe("1984 ehf");
    expect(matchHost({ asn: "as44925" })?.org).toBe("1984 ehf"); // case-insensitive
  });
  it("matches by operator alias (virtualroad / qurium / 1984)", () => {
    expect(matchHost({ org: "Qurium" })?.org).toBe("1984 ehf");
    expect(matchHost({ hostName: "THE-1984-AS" })?.org).toBe("1984 ehf");
  });
  it("returns null for an unrelated host", () => {
    expect(matchHost({ asn: "AS15169", org: "Google LLC" })).toBeNull();
  });
});

describe("buildHostConduct", () => {
  it("surfaces documented findings at High confidence WITH citations", () => {
    const p = buildHostConduct({ asn: "AS44925" });
    expect(p.matched).toBe(true);
    expect(p.confidence).toBe("High");
    expect(p.org).toBe("1984 ehf");
    const court = p.findings.find((f) => /court|target list/i.test(f.label));
    expect(court).toBeTruthy();
    expect(court!.severity).toBe("high");
    expect(court!.sources.some((s) => /ADL/i.test(s))).toBe(true);
    expect(court!.sources.some((s) => /Court of Appeals/i.test(s))).toBe(true);
  });

  it("separates the co-hosted extremist flag with the client caveat (never a client claim)", () => {
    const p = buildHostConduct({ asn: "AS44925", coHostedSample: ["hitler.nu", "normalshop.com"] });
    expect(p.coHostedExtremist.some((d) => d.domain === "hitler.nu")).toBe(true);
    expect(p.clientCaveat).toMatch(/not proof that any particular client/i);
    expect(p.sweep!.neutralCount).toBe(1);
  });

  it("classifies a reverse-DNS sample even without a documented match", () => {
    const p = buildHostConduct({ asn: "AS99999", coHostedSample: ["hitler.nu", "aryanbrand.net", "cafe.com"] });
    expect(p.matched).toBe(false);
    expect(p.confidence).toBe("Unknown");
    expect(p.coHostedExtremist.length).toBeGreaterThanOrEqual(1);
  });

  it("an unknown host is 'not assessed' (Unknown), never 'clean'", () => {
    const p = buildHostConduct({ asn: "AS15169", org: "Google LLC" });
    expect(p.matched).toBe(false);
    expect(p.confidence).toBe("Unknown");
    expect(p.note).toMatch(/not assessed/i);
    expect(p.note).toMatch(/not a clean record/i); // explicitly refuses "clean"
  });

  it("the reference is populated (seed present) so counts distinguish empty from no-match", () => {
    expect(hostConductCount()).toBeGreaterThan(0);
  });
});
