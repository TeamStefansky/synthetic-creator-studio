import { describe, it, expect } from "vitest";
import { extractGaIds, extractAdsenseIds, extractRichTrackers } from "../lib/trackers";

describe("tracker-ID extraction (one source of truth)", () => {
  it("extracts GA4 / Universal / Google Tag ids (union, deduped)", () => {
    const html = `<script src="gtag/js?id=G-ABC123XYZ"></script> UA-1234567-8 GT-ABCD12 UA-1234567-8`;
    expect(extractGaIds(html).sort()).toEqual(["G-ABC123XYZ", "GT-ABCD12", "UA-1234567-8"]);
  });

  it("extracts AdSense publisher ids", () => {
    expect(extractAdsenseIds(`ca-pub-1234567890123456 and ca-pub-9999999999`)).toEqual([
      "ca-pub-1234567890123456", "ca-pub-9999999999",
    ]);
  });

  it("returns [] when there are no ids", () => {
    expect(extractGaIds("nothing here")).toEqual([]);
    expect(extractAdsenseIds("nothing here")).toEqual([]);
  });

  it("extracts the rich tracker set with the board's kind/value/display shape", () => {
    const html = [
      "GTM-AB12CD",
      `fbq('init','123456789')`,
      `hotjar hjid: 1234567`,
      `clarity "abcd1234efgh"`,
      `ym(12345,`,
      `//stats.example.com/matomo.js`,
      `_paq.push(['setSiteId', '7']);`,
    ].join("\n");
    const rich = extractRichTrackers(html);
    const byKind = Object.fromEntries(rich.map((t) => [t.kind, t.value]));
    expect(byKind.gtm_id).toBe("GTM-AB12CD");
    expect(byKind.fb_pixel_id).toBe("123456789");
    expect(byKind.hotjar_id).toBe("1234567");
    expect(byKind.clarity_id).toBe("abcd1234efgh");
    expect(byKind.yandex_id).toBe("12345");
    expect(byKind.matomo_id).toBe("stats.example.com#7");
    expect(rich.find((t) => t.kind === "matomo_id")?.display).toMatch(/stats\.example\.com site 7/);
  });
});
