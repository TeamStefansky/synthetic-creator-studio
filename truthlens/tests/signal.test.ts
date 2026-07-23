// SIGNAL console model - the HONEST replacement for the uploaded dashboard's
// client-side "invent it with an LLM" call. Gates: real mentions in, real
// aggregates out; per-type + per-country breakdowns; most-active ACCOUNTS (never
// people); a timeline from real dated mentions; and a summary that never invents
// sentiment. An empty collection yields an honest "none observed" summary.

import { describe, it, expect } from "vitest";
import {
  buildSignal,
  buildTimeline,
  isoDate,
  titleAndSnippet,
  topTalkers,
  typeBreakdown,
  type MentionsApiResponse,
} from "../lib/signal";
import type { MapMention } from "../lib/mentions-map";

function m(p: Partial<MapMention>): MapMention {
  return {
    source: "gdelt",
    id: Math.random().toString(36),
    text: "sample",
    sourceType: "news",
    ...p,
  } as MapMention;
}

describe("titleAndSnippet", () => {
  it("splits on the first sentence", () => {
    const { title, snippet } = titleAndSnippet("Acme raises a round. Investors are pleased overall.");
    expect(title).toBe("Acme raises a round.");
    expect(snippet).toBe("Investors are pleased overall.");
  });
  it("cuts long single-line text on a word boundary", () => {
    const long = "word ".repeat(40).trim();
    const { title } = titleAndSnippet(long);
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.endsWith(" ")).toBe(false);
  });
  it("handles empty text honestly", () => {
    expect(titleAndSnippet("").title).toBe("(no text)");
  });
});

describe("isoDate", () => {
  it("extracts YYYY-MM-DD", () => {
    expect(isoDate("2024-06-03T10:20:00Z")).toBe("2024-06-03");
  });
  it("returns empty for missing/invalid", () => {
    expect(isoDate(undefined)).toBe("");
    expect(isoDate("not a date")).toBe("");
  });
});

describe("typeBreakdown", () => {
  it("counts per type in a stable order, keeping zero buckets", () => {
    const mentions = [
      m({ sourceType: "news" }),
      m({ sourceType: "news" }),
      m({ sourceType: "social" }),
      m({ sourceType: "forum" }),
    ].map((x) => ({ ...x, title: "t", snippet: "", date: "" }));
    const bt = typeBreakdown(mentions as any);
    expect(bt.map((t) => t.type)).toEqual(["news", "social", "forum", "video"]);
    expect(bt.find((t) => t.type === "news")?.count).toBe(2);
    expect(bt.find((t) => t.type === "video")?.count).toBe(0);
  });
});

describe("topTalkers", () => {
  it("ranks accounts by mention count and ignores empty accounts", () => {
    const mentions = [
      m({ source: "reddit", account: "alpha" }),
      m({ source: "reddit", account: "alpha" }),
      m({ source: "x", account: "beta" }),
      m({ account: "" }),
    ].map((x) => ({ ...x, title: "t", snippet: "", date: "" }));
    const t = topTalkers(mentions as any);
    expect(t[0]).toMatchObject({ name: "alpha", source: "reddit", count: 2 });
    expect(t.find((x) => x.name === "beta")?.count).toBe(1);
    expect(t.some((x) => x.name === "")).toBe(false);
  });
  it("keys by source+name so same handle on two platforms stays distinct", () => {
    const mentions = [
      m({ source: "reddit", account: "news" }),
      m({ source: "x", account: "news" }),
    ].map((x) => ({ ...x, title: "t", snippet: "", date: "" }));
    expect(topTalkers(mentions as any).length).toBe(2);
  });
});

describe("buildTimeline", () => {
  it("returns dated events oldest -> newest within the window", () => {
    const mentions = [
      m({ timestamp: "2024-06-04T00:00:00Z", text: "D happened." }),
      m({ timestamp: "2024-06-01T00:00:00Z", text: "A happened." }),
      m({ timestamp: "2024-06-03T00:00:00Z", text: "C happened." }),
      m({ text: "no date" }),
    ].map((x) => ({ ...x, ...titleAndSnippet(x.text), date: isoDate(x.timestamp) }));
    const tl = buildTimeline(mentions as any);
    expect(tl.map((e) => e.date)).toEqual(["2024-06-01", "2024-06-03", "2024-06-04"]);
    expect(tl[0].event).toBe("A happened.");
  });
});

describe("buildSignal", () => {
  const api: MentionsApiResponse = {
    entity: "Acme",
    total: 3,
    sources: [
      { source: "gdelt", connected: true, count: 2 },
      { source: "reddit", connected: true, count: 1 },
      { source: "x", connected: false, reason: "Set X_BEARER_TOKEN", count: 0 },
    ],
    mentions: [
      m({ source: "gdelt", sourceType: "news", account: "bbc.com", country: "GB", timestamp: "2024-06-03T00:00:00Z", text: "Acme in the news." }),
      m({ source: "gdelt", sourceType: "news", account: "cnn.com", country: "US", timestamp: "2024-06-02T00:00:00Z", text: "Acme again." }),
      m({ source: "reddit", sourceType: "forum", account: "user1", timestamp: "2024-06-04T00:00:00Z", text: "Acme thread." }),
    ],
    byCountry: [
      { key: "GB", label: "United Kingdom", flag: "🇬🇧", count: 1, code: "GB", lat: 54, lon: -2 },
      { key: "US", label: "United States", flag: "🇺🇸", count: 1, code: "US", lat: 39, lon: -98 },
    ],
    countryUnknown: 1,
  };

  it("produces real aggregates without inventing sentiment", () => {
    const s = buildSignal(api);
    expect(s.mentions.length).toBe(3);
    expect(s.byType.find((t) => t.type === "news")?.count).toBe(2);
    expect(s.byType.find((t) => t.type === "forum")?.count).toBe(1);
    expect(s.talkers.length).toBe(3);
    expect(s.timeline.map((e) => e.date)).toEqual(["2024-06-02", "2024-06-03", "2024-06-04"]);
    // No sentiment field is fabricated anywhere in the model.
    expect(JSON.stringify(s)).not.toMatch(/sentiment/i);
  });

  it("passes source statuses through, including an honest not-connected one", () => {
    const s = buildSignal(api);
    expect(s.sources.find((x) => x.source === "x")?.connected).toBe(false);
    expect(s.summary).toContain("Acme");
    expect(s.summary).toContain("2 connected source"); // gdelt + reddit
  });

  it("gives an honest 'none observed' summary when empty", () => {
    const empty: MentionsApiResponse = { ...api, total: 0, mentions: [], byCountry: [], countryUnknown: 0 };
    const s = buildSignal(empty);
    expect(s.total).toBe(0);
    expect(s.summary).toMatch(/No public mentions/i);
    expect(s.mentions.length).toBe(0);
  });
});
