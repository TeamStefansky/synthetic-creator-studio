// Auto-detect what kind of check an input is, so /check can route it to the
// right existing tool. Pure functions — unit-tested. The user can always override.

import { parseProfileInput } from "@/lib/social/profile";

export type CheckType = "site" | "post" | "logs" | "email" | "narrative" | "cib" | "social";

export interface Detection {
  type: CheckType;
  label: string;
  reason: string;
  confidence: "Low" | "Medium" | "High";
}

const LABELS: Record<CheckType, string> = {
  site: "Site Report", post: "Post Check", logs: "Log Analyzer",
  email: "Email Tracer", narrative: "Narrative Check", cib: "CIB Analysis",
  social: "Social Analyze",
};

const SOCIAL_HOSTS = [
  "twitter.com", "x.com", "facebook.com", "instagram.com", "reddit.com",
  "t.me", "telegram.me", "bsky.app", "tiktok.com", "threads.net", "youtube.com", "youtu.be",
];

const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const EMAIL_HEADER = /^(Received|Return-Path|DKIM-Signature|From|To|Subject|Message-ID|Delivered-To|Authentication-Results):/im;
const HTTP_LOG = /"?(GET|POST|HEAD|PUT|DELETE|OPTIONS)\s+\S+\s+HTTP\/\d/i;

function det(type: CheckType, reason: string, confidence: Detection["confidence"]): Detection {
  return { type, label: LABELS[type], reason, confidence };
}

/** Best-effort classification of a raw input string. */
export function detectCheckType(input: string): Detection {
  const text = (input || "").trim();
  if (!text) return det("post", "Empty input — defaulting to Post Check.", "Low");

  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  // Email headers: multiple RFC-822 header lines.
  const headerHits = (text.match(EMAIL_HEADER) ? 1 : 0)
    + (/^Received:/im.test(text) ? 1 : 0)
    + (/^Return-Path:/im.test(text) ? 1 : 0);
  if (headerHits >= 2 || /^Received:\s/im.test(text)) {
    return det("email", "Looks like raw email headers (Received / Return-Path lines).", "High");
  }

  // Server logs: several lines, most carrying an IP and/or an HTTP request line.
  if (lines.length >= 3) {
    const ipLines = lines.filter((l) => IP.test(l)).length;
    const httpLines = lines.filter((l) => HTTP_LOG.test(l)).length;
    if (httpLines >= 2 || ipLines >= Math.max(3, Math.ceil(lines.length * 0.6))) {
      return det("logs", `Looks like server log lines (${ipLines} with IPs, ${httpLines} HTTP requests).`, "High");
    }
  }

  // A single URL / bare domain → site, unless it's a social post link.
  const oneToken = !/\s/.test(text) && lines.length === 1;
  const urlMatch = text.match(/^https?:\/\/([^/\s]+)/i);

  // A social PROFILE link (bsky.app/profile/…, x.com/<handle>) or an @handle →
  // Social Analyze (profile-seeded influence-op pipeline). Post/status links
  // fall through to Post Check; bare domains fall through to Site Report.
  if (oneToken) {
    const prof = parseProfileInput(text);
    if (prof && (urlMatch || text.startsWith("@"))) {
      return det("social",
        `A ${prof.platform === "x" ? "X" : "Bluesky"} profile — analyzing the account and the narrative it amplifies.`,
        urlMatch ? "High" : "Medium");
    }
  }
  const bareDomain = /^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(text);
  if (oneToken && (urlMatch || bareDomain)) {
    const host = (urlMatch?.[1] || text).replace(/^www\./, "").split("/")[0].toLowerCase();
    if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
      return det("post", `A ${host} link — checking the post/claim it contains.`, "Medium");
    }
    return det("site", "A website URL / domain — running an infrastructure & credibility report.", "High");
  }

  // Otherwise: free text → a claim / post to fact-check.
  return det("post", "Free text — treating it as a claim/post to fact-check.", "Medium");
}

export const CHECK_TYPES: { type: CheckType; label: string }[] =
  (Object.keys(LABELS) as CheckType[]).map((type) => ({ type, label: LABELS[type] }));
