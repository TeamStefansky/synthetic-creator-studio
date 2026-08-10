// One source of truth for tracker / analytics ID extraction from page HTML.
// Previously the same regexes lived in three places with subtle drift
// (lib/fingerprint.ts, lib/clues/extract.ts, lib/board/links.ts). The GA/AdSense
// patterns here are the UNION of those copies (they include the GT- tag id and the
// longer UA- suffix), so migrating callers only ever matches MORE ids, never fewer.
// Functions build a fresh RegExp per call to avoid shared /g lastIndex state.

/** Google Analytics / Google Tag ids (GA4 G-, Universal UA-, Google Tag GT-). */
export function extractGaIds(html: string): string[] {
  const re = /\b(?:G-[A-Z0-9]{6,}|UA-\d{4,}-\d+|GT-[A-Z0-9]{6,})\b/g;
  return [...new Set(html.match(re) || [])];
}

export type GaFamily = "ga4" | "universal" | "gtag" | "unknown";
export interface GaIdInfo {
  family: GaFamily;
  /** True for Universal Analytics (UA-), which Google shut down on 1 Jul 2023. */
  deprecated: boolean;
  note: string;
}

/**
 * Classify a Google id by family and recency. Universal Analytics (UA-) was shut
 * down by Google on 1 July 2023, so a *live* UA tag is a recency signal in its own
 * right: it points to a long-unmaintained site or a stale value carried across a
 * template - and it carries LESS corroborating weight than a current GA4 (G-) or
 * Google Tag (GT-) overlap. This is a fact about the id format, not a clock read.
 */
export function classifyGaId(id: string): GaIdInfo {
  if (/^UA-\d{4,}-\d+$/.test(id)) {
    return {
      family: "universal",
      deprecated: true,
      note:
        "Universal Analytics (UA-) was shut down by Google on 1 July 2023. A live UA tag " +
        "indicates a long-unmaintained site or a stale, carried-over value - it corroborates " +
        "a link less than a current GA4 (G-) or Tag Manager (GTM-) overlap would.",
    };
  }
  if (/^G-[A-Z0-9]{6,}$/.test(id)) return { family: "ga4", deprecated: false, note: "GA4 measurement id (current)." };
  if (/^GT-[A-Z0-9]{6,}$/.test(id)) return { family: "gtag", deprecated: false, note: "Google Tag id (current)." };
  return { family: "unknown", deprecated: false, note: "" };
}

/** Google AdSense publisher ids (ca-pub-…). */
export function extractAdsenseIds(html: string): string[] {
  const re = /\bca-pub-\d{10,}\b/g;
  return [...new Set(html.match(re) || [])];
}

export interface TrackerArtifact { kind: string; value: string; display?: string }

/** The richer ID-bearing tags beyond GA/AdSense: GTM container, Meta pixel,
 * Hotjar, Microsoft Clarity, Yandex Metrica, Matomo. Values match the Link Board's
 * existing artifact wiring (kind + value [+ display]); order is stable. */
export function extractRichTrackers(html: string): TrackerArtifact[] {
  const out: TrackerArtifact[] = [];
  for (const m of html.matchAll(/GTM-[A-Z0-9]{4,}/g)) out.push({ kind: "gtm_id", value: m[0] });
  for (const m of html.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,})['"]/g)) out.push({ kind: "fb_pixel_id", value: m[1] });
  for (const m of html.matchAll(/hotjar[^0-9]{0,20}hjid\s*[:=]\s*(\d{4,})/gi)) out.push({ kind: "hotjar_id", value: m[1] });
  for (const m of html.matchAll(/clarity[^"']{0,40}["']([a-z0-9]{8,12})["']/gi)) out.push({ kind: "clarity_id", value: m[1] });
  for (const m of html.matchAll(/ym\(\s*(\d{5,})\s*,/g)) out.push({ kind: "yandex_id", value: m[1] });
  const matomoHost = html.match(/\/\/([a-z0-9.-]+)\/matomo\.js/i)?.[1] || html.match(/setTrackerUrl[^"']+["']https?:\/\/([a-z0-9.-]+)\//i)?.[1];
  const matomoSite = html.match(/setSiteId["',\s]+["']?(\d+)/i)?.[1];
  if (matomoHost && matomoSite) out.push({ kind: "matomo_id", value: `${matomoHost.toLowerCase()}#${matomoSite}`, display: `${matomoHost} site ${matomoSite}` });
  return out;
}
