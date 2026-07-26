import { describe, it, expect } from "vitest";
import { lookupPublicOfficers } from "../lib/public-records";

describe("public-record officer disclosure (lawful, cited)", () => {
  it("shows an honest not-connected state without a key (never faked)", async () => {
    const r = await lookupPublicOfficers("1984 ehf");
    expect(r.connected).toBe(false);           // no OPENCORPORATES_API_KEY in test env
    expect(r.officers).toHaveLength(0);
    expect(r.reason).toMatch(/OPENCORPORATES_API_KEY/);
  });

  it("frames names as public-record disclosure, not attribution", async () => {
    const r = await lookupPublicOfficers("Some Org");
    expect(r.note).toMatch(/public-record disclosure|not attribution/i);
  });

  it("an empty query returns nothing", async () => {
    const r = await lookupPublicOfficers("");
    expect(r.officers).toHaveLength(0);
  });
});
