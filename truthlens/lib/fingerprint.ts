// Fingerprint a fetched page: detect CMS / frameworks / ad networks / trackers,
// extract Google Analytics + AdSense IDs and emails, and detect the presence of
// about / contact / author / corrections affordances. Also extract main text
// for the content-analysis layer.

import * as cheerio from "cheerio";
import type { TechInfo } from "./types";

export interface FingerprintResult {
  tech: TechInfo;
  emails: string[];
  articleText: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const GA_RE = /\b(G-[A-Z0-9]{6,}|UA-\d{4,}-\d{1,4})\b/g;
const ADSENSE_RE = /\b(ca-pub-\d{10,})\b/g;

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

export function fingerprint(
  html: string,
  headers: Record<string, string>
): FingerprintResult {
  const $ = cheerio.load(html);
  const lowerHtml = html.toLowerCase();

  // ---- Analytics / AdSense IDs -------------------------------------------
  const gaIds = uniq(html.match(GA_RE) ?? []);
  const adsenseIds = uniq(html.match(ADSENSE_RE) ?? []);

  // ---- Emails (filter out asset filenames that look like emails) ---------
  const emails = uniq(
    (html.match(EMAIL_RE) ?? [])
      .map((e) => e.toLowerCase())
      .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e))
  ).slice(0, 15);

  // ---- CMS / framework detection -----------------------------------------
  let cms: string | null = null;
  const generator = $('meta[name="generator"]').attr("content")?.toLowerCase();
  if (generator?.includes("wordpress") || lowerHtml.includes("/wp-content/"))
    cms = "WordPress";
  else if (generator?.includes("drupal") || lowerHtml.includes("drupal"))
    cms = "Drupal";
  else if (generator?.includes("joomla")) cms = "Joomla";
  else if (generator?.includes("ghost")) cms = "Ghost";
  else if (lowerHtml.includes("cdn.shopify.com")) cms = "Shopify";
  else if (lowerHtml.includes("wix.com")) cms = "Wix";
  else if (lowerHtml.includes("squarespace")) cms = "Squarespace";
  else if (generator) cms = generator;

  const frameworks: string[] = [];
  if (lowerHtml.includes("__next_data__") || lowerHtml.includes("/_next/"))
    frameworks.push("Next.js");
  if (lowerHtml.includes("data-reactroot") || lowerHtml.includes("react"))
    frameworks.push("React");
  if (lowerHtml.includes("ng-version") || lowerHtml.includes("angular"))
    frameworks.push("Angular");
  if (lowerHtml.includes("vue") && lowerHtml.includes("data-v-"))
    frameworks.push("Vue");

  // ---- Ad networks & trackers --------------------------------------------
  const adNetworks: string[] = [];
  if (adsenseIds.length || lowerHtml.includes("pagead2.googlesyndication"))
    adNetworks.push("Google AdSense");
  if (lowerHtml.includes("doubleclick")) adNetworks.push("DoubleClick");
  if (lowerHtml.includes("taboola")) adNetworks.push("Taboola");
  if (lowerHtml.includes("outbrain")) adNetworks.push("Outbrain");
  if (lowerHtml.includes("amazon-adsystem")) adNetworks.push("Amazon Ads");

  const trackers: string[] = [];
  if (gaIds.length || lowerHtml.includes("google-analytics.com"))
    trackers.push("Google Analytics");
  if (lowerHtml.includes("googletagmanager")) trackers.push("Google Tag Manager");
  if (lowerHtml.includes("connect.facebook.net") || lowerHtml.includes("fbq("))
    trackers.push("Meta Pixel");
  if (lowerHtml.includes("hotjar")) trackers.push("Hotjar");
  if (lowerHtml.includes("clarity.ms")) trackers.push("Microsoft Clarity");

  // ---- Server header ------------------------------------------------------
  const server = headers["server"] ?? null;

  // ---- Transparency affordances ------------------------------------------
  const links = $("a")
    .map((_, el) => ($(el).attr("href") ?? "") + " " + $(el).text())
    .get()
    .join(" ")
    .toLowerCase();

  const hasAbout = /about|about-us|who we are/.test(links);
  const hasContact = /contact|contact-us|get in touch/.test(links);
  const hasCorrections = /correction|corrections policy|errata/.test(
    links + " " + lowerHtml
  );

  // Authors: look for bylines, rel=author, article:author, schema.org author.
  const hasAuthors =
    $('[rel="author"], [class*="author"], [class*="byline"]').length > 0 ||
    lowerHtml.includes('"@type":"person"') ||
    lowerHtml.includes("article:author") ||
    /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test($("body").text());

  // ---- Main article text --------------------------------------------------
  $("script, style, noscript, svg, nav, header, footer, aside").remove();
  const candidates = ["article", "main", '[role="main"]', ".post", ".entry-content"];
  let text = "";
  for (const sel of candidates) {
    const t = $(sel).text().replace(/\s+/g, " ").trim();
    if (t.length > text.length) text = t;
  }
  if (text.length < 200) {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }
  const articleText = text.slice(0, 6000);

  const tech: TechInfo = {
    cms,
    server,
    frameworks: uniq(frameworks),
    adNetworks: uniq(adNetworks),
    trackers: uniq(trackers),
    gaIds,
    adsenseIds,
    hasAbout,
    hasContact,
    hasAuthors,
    hasCorrections,
  };

  return { tech, emails, articleText };
}
