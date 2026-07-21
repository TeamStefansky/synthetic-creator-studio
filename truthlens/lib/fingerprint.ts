// Tech / identity fingerprinting from fetched HTML + response headers.
// Extracts CMS, frameworks, ad networks, trackers, GA/AdSense IDs, emails,
// and the presence of transparency pages (about/contact/author/corrections).

import * as cheerio from "cheerio";
import type { TechInfo, SeoInfo } from "./types";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const GA_RE = /\b(G-[A-Z0-9]{6,}|UA-\d{4,}-\d{1,4})\b/g;
const ADSENSE_RE = /\bca-pub-\d{10,}\b/g;

const AD_NETWORKS: { name: string; re: RegExp }[] = [
  { name: "Google AdSense", re: /pagead2\.googlesyndication|adsbygoogle/i },
  { name: "Google Ad Manager", re: /googletagservices|securepubads/i },
  { name: "Taboola", re: /taboola/i },
  { name: "Outbrain", re: /outbrain/i },
  { name: "Media.net", re: /media\.net/i },
  { name: "Amazon Ads", re: /amazon-adsystem/i },
  { name: "PropellerAds", re: /propellerads|propeller/i },
  { name: "RevContent", re: /revcontent/i },
];

const TRACKERS: { name: string; re: RegExp }[] = [
  { name: "Google Analytics", re: /google-analytics|gtag\/js|googletagmanager/i },
  { name: "Facebook Pixel", re: /connect\.facebook\.net|fbq\(/i },
  { name: "Hotjar", re: /hotjar/i },
  { name: "Yandex Metrica", re: /mc\.yandex|metrika/i },
  { name: "TikTok Pixel", re: /analytics\.tiktok/i },
  { name: "Matomo / Piwik", re: /matomo|piwik/i },
];

const FRAMEWORKS: { name: string; re: RegExp }[] = [
  { name: "React", re: /react(\.production)?\.min\.js|data-reactroot|__NEXT_DATA__/i },
  { name: "Next.js", re: /__NEXT_DATA__|\/_next\//i },
  { name: "Vue", re: /vue(\.runtime)?(\.min)?\.js|data-v-/i },
  { name: "Angular", re: /ng-version|angular(\.min)?\.js/i },
  { name: "jQuery", re: /jquery(-\d|\.min)?\.js/i },
  { name: "Bootstrap", re: /bootstrap(\.min)?\.(js|css)/i },
];

function detectCms(html: string, headers: Record<string, string>): string | undefined {
  const h = html.toLowerCase();
  if (/wp-content|wp-includes|wordpress/.test(h)) return "WordPress";
  if (/\/sites\/default\/files|drupal/.test(h)) return "Drupal";
  if (/joomla|\/media\/system\//.test(h)) return "Joomla";
  if (/cdn\.shopify|myshopify/.test(h)) return "Shopify";
  if (/wix\.com|wixstatic/.test(h)) return "Wix";
  if (/squarespace/.test(h)) return "Squarespace";
  if (/ghost(\.min)?\.js|content\/themes\/casper/.test(h)) return "Ghost";
  const powered = headers["x-powered-by"];
  if (powered && /wordpress|drupal|express|php/i.test(powered)) return powered;
  return undefined;
}

function matchAll(re: RegExp, html: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(html)) !== null) {
    out.add(m[1] || m[0]);
    if (out.size > 50) break;
  }
  return Array.from(out);
}

function hasLink($: cheerio.CheerioAPI, patterns: RegExp): boolean {
  let found = false;
  $("a").each((_, el) => {
    if (found) return;
    const href = ($(el).attr("href") || "").toLowerCase();
    const text = ($(el).text() || "").toLowerCase();
    if (patterns.test(href) || patterns.test(text)) found = true;
  });
  return found;
}

export function fingerprint(
  html: string,
  headers: Record<string, string>,
  pageDomain: string,
): TechInfo {
  const $ = cheerio.load(html || "");

  const frameworks = FRAMEWORKS.filter((f) => f.re.test(html)).map((f) => f.name);
  const adNetworks = AD_NETWORKS.filter((a) => a.re.test(html)).map((a) => a.name);
  const trackers = TRACKERS.filter((t) => t.re.test(html)).map((t) => t.name);

  const gaIds = matchAll(GA_RE, html);
  const adsenseIds = matchAll(ADSENSE_RE, html);

  // Emails: from mailto: and raw text, excluding obvious asset filenames.
  const emails = new Set<string>();
  $("a[href^='mailto:']").each((_, el) => {
    const e = ($(el).attr("href") || "").replace(/^mailto:/i, "").split("?")[0];
    if (e) emails.add(e.toLowerCase());
  });
  for (const e of html.match(EMAIL_RE) || []) {
    if (!/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e)) emails.add(e.toLowerCase());
  }

  // Multilingual detection - English + Hebrew + common European terms - so
  // legitimate non-English outlets aren't penalized for "missing" pages.
  const hasAbout = hasLink(
    $,
    /about|about-us|who-we-are|אודות|מי אנחנו|אודותינו|über uns|à propos|sobre nosotros|chi siamo|over ons/i,
  );
  const hasContact = hasLink(
    $,
    /contact|contact-us|reach-us|צור קשר|יצירת קשר|צרו קשר|kontakt|contacto|contatti|nous contacter/i,
  );
  const hasAuthor =
    hasLink($, /\/author\/|\/writers?\/|byline|מאת|הכותב|כתבים|מערכת|הכתב/i) ||
    $("[rel='author'], .author, .byline, [itemprop='author'], [class*='author'], [class*='byline']").length > 0 ||
    $("meta[name='author'], meta[property='article:author']").length > 0;
  const hasCorrections = hasLink(
    $,
    /correction|corrections|ethics|editorial-policy|תיקון|תיקונים|מדיניות|אתיקה|תקנון/i,
  );

  return {
    cms: detectCms(html, headers),
    frameworks,
    adNetworks,
    trackers,
    gaIds,
    adsenseIds,
    emails: Array.from(emails).slice(0, 20),
    hasAbout,
    hasContact,
    hasAuthor,
    hasCorrections,
  };
}

/** Extract the most prominent image URLs (og:image + article imgs), absolute. */
export function extractImages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html || "");
  const out = new Set<string>();
  const abs = (src?: string) => {
    if (!src) return;
    try {
      out.add(new URL(src, baseUrl).toString());
    } catch {
      /* skip */
    }
  };
  abs($("meta[property='og:image'], meta[name='twitter:image']").attr("content"));
  $("article img, main img, img").each((_, el) => {
    if (out.size >= 8) return;
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && !/\.svg($|\?)|sprite|logo|icon|avatar|1x1|pixel/i.test(src)) abs(src);
  });
  return Array.from(out).slice(0, 8);
}

/** SEO health - established publishers tend to ship complete SEO metadata. */
export function extractSeo(html: string): SeoInfo {
  const $ = cheerio.load(html || "");
  const title = $("title").first().text().trim() || undefined;
  const metaDescription = $("meta[name='description']").attr("content")?.trim() || undefined;
  const hasOpenGraph = $("meta[property^='og:']").length > 0;
  const hasStructuredData =
    $("script[type='application/ld+json']").length > 0 ||
    $("[itemscope]").length > 0;
  const hasCanonical = $("link[rel='canonical']").length > 0;
  const hasViewport = $("meta[name='viewport']").length > 0;
  const hasFavicon = $("link[rel~='icon'], link[rel='shortcut icon']").length > 0;
  const headings = $("h1, h2, h3").length;

  // Completeness score (0-100): weighted presence of standard SEO signals.
  let score = 0;
  if (title) score += 18;
  if (metaDescription) score += 18;
  if (hasOpenGraph) score += 18;
  if (hasStructuredData) score += 20;
  if (hasCanonical) score += 12;
  if (hasViewport) score += 7;
  if (hasFavicon) score += 7;
  if (headings >= 3) score += 0; // headings inform but don't inflate the score
  score = Math.min(100, score);

  return {
    title,
    metaDescription,
    hasOpenGraph,
    hasStructuredData,
    hasCanonical,
    hasViewport,
    hasFavicon,
    headings,
    seoScore: score,
  };
}

/** Extract a distinctive sentence + the main article text for downstream use. */
export function extractArticle(html: string): { text: string; quote: string } {
  const $ = cheerio.load(html || "");
  $("script, style, nav, header, footer, aside, noscript").remove();
  const candidates = ["article", "main", "[role='main']", ".article-body", ".post-content", "#content"];
  let text = "";
  for (const sel of candidates) {
    const t = $(sel).text().replace(/\s+/g, " ").trim();
    if (t.length > text.length) text = t;
  }
  if (text.length < 200) {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }
  text = text.slice(0, 12000);

  // Pick the longest "sentence" as the distinctive quote for propagation search.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 200);
  const quote = sentences.sort((a, b) => b.length - a.length)[0] || text.slice(0, 160);

  return { text, quote };
}
