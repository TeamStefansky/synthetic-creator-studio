// Tool consolidation. Gates: every former stand-alone tool route still belongs
// to exactly one view set (deep links keep working and keep the sidebar entry
// highlighted); History reopens each recorded type on a page that can actually
// restore it (the old /check?reopen= for everything was a dead end).

import { describe, it, expect } from "vitest";
import { VIEW_SETS, inViewSet, activeView, type ViewSetId } from "@/lib/views";
import { reopenHref } from "@/lib/clues/reopen";

describe("view sets", () => {
  it("each merged route lives in exactly one set", () => {
    const all = Object.values(VIEW_SETS).flatMap((s) => s.views.map((v) => v.href));
    expect(new Set(all).size).toBe(all.length);
    for (const r of ["/tools/signal", "/tools/mentions", "/tools/radar", "/tools/origin", "/tools/origin-map", "/status", "/connections", "/history", "/checks"]) {
      expect(all).toContain(r);
    }
  });
  it("highlights the right sidebar entry and tab for each route", () => {
    expect(inViewSet("signal", "/tools/radar")).toBe(true);
    expect(inViewSet("origin", "/tools/origin-map")).toBe(true);
    expect(activeView("origin", "/tools/origin-map")?.label).toBe("Map");
    expect(activeView("origin", "/tools/origin")?.label).toBe("Exposure audit");
    expect(inViewSet("connections", "/connections")).toBe(true);
    expect(inViewSet("signal" as ViewSetId, "/tools/osint")).toBe(false);
  });
});

describe("reopenHref", () => {
  it("check types reopen in /check; tool searches reopen on their own page pre-filled", () => {
    expect(reopenHref({ id: "a1", type: "site", input: "x.com" })).toBe("/check?reopen=a1");
    expect(reopenHref({ id: "a2", type: "osint", input: "AS44925" })).toBe("/tools/osint?q=AS44925");
    expect(reopenHref({ id: "a3", type: "signal", input: "israel gaza" })).toBe("/tools/signal?entity=israel%20gaza");
    expect(reopenHref({ id: "a4", type: "origin", input: "x.com" })).toBe("/tools/origin?domain=x.com");
    expect(reopenHref({ id: "a5", type: "crypto", input: "bc1q" })).toBe("/tools/crypto?address=bc1q");
    expect(reopenHref({ id: "a6", type: "origin-map", input: "x" })).toBe("/tools/origin-map");
  });
});
