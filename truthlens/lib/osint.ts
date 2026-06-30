// Deep OSINT research on a site — open-web only. Uses the Anthropic web_search
// server tool to investigate who is behind a domain and how it is regarded,
// returning a structured, cited dossier. On-demand (slow/costly), gated behind
// ANTHROPIC_API_KEY. Everything is presented as research findings with sources,
// not assertions of fact.

import Anthropic from "@anthropic-ai/sdk";
import { cacheGet, cacheSet } from "./cache";
import type { OsintDossier, Confidence } from "./types";

const UNAVAILABLE: OsintDossier = {
  available: false,
  summary: "Deep OSINT research needs ANTHROPIC_API_KEY (web_search) to be configured.",
  entities: [],
  affiliations: [],
  socialProfiles: [],
  funding: "",
  reputation: "",
  controversies: [],
  relatedSites: [],
  citations: [],
  confidence: "Low",
  note: "Set ANTHROPIC_API_KEY on the server to enable open-web OSINT research.",
};

function normConfidence(v: any): Confidence {
  const s = String(v || "").toLowerCase();
  if (s.startsWith("h")) return "High";
  if (s.startsWith("m")) return "Medium";
  return "Low";
}

function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

/** Pull the final JSON object out of the model's text, tolerating fences/prose. */
function extractJson(raw: string): any | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const m = candidate.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function researchDomain(
  domain: string,
  context?: { finalUrl?: string; registrantOrg?: string; siblingDomains?: string[] },
): Promise<OsintDossier> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE;

  // Cache dossiers for 24h — this is the expensive path.
  const cached = await cacheGet<OsintDossier>(`osint:${domain}`);
  if (cached) return cached;

  const hints: string[] = [];
  if (context?.registrantOrg) hints.push(`WHOIS registrant org: ${context.registrantOrg}`);
  if (context?.siblingDomains?.length)
    hints.push(`Infrastructure-linked sibling domains: ${context.siblingDomains.slice(0, 10).join(", ")}`);

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as any],
      system:
        "You are an OSINT analyst. Investigate ONLY using open, public web sources. Attribute findings to sources. Distinguish confirmed facts from inference. Never fabricate people, links, or URLs — if unknown, say so. Output is consumed by software: end with a single JSON object and nothing after it.",
      messages: [
        {
          role: "user",
          content: `Conduct open-source intelligence (OSINT) research on the website "${domain}"${
            context?.finalUrl ? ` (${context.finalUrl})` : ""
          }. Investigate: who owns/operates it, the people and organizations behind it, political/commercial affiliations or networks, its social-media presence, how it makes money/who funds it, how fact-checkers and the press regard it, any documented controversies, and other related sites.
${hints.length ? "\nKnown leads:\n- " + hints.join("\n- ") + "\n" : ""}
Use web_search as needed. Then output ONE JSON object with EXACTLY this shape (no text after it):
{
  "summary": "2-4 sentence narrative of who is behind the site and how it is regarded",
  "entities": [{"name":"","role":"owner|editor|parent company|registrant|author|funder|other","evidence":"what source supports this"}],
  "affiliations": ["network / political / commercial ties"],
  "socialProfiles": [{"platform":"","handle":"","url":""}],
  "funding": "monetization / funding model if known, else empty",
  "reputation": "how fact-checkers / press regard it, else empty",
  "controversies": ["documented controversy"],
  "relatedSites": ["related domain"],
  "citations": [{"title":"","url":""}],
  "confidence": "Low|Medium|High"
}
Only include items you actually found evidence for. Leave arrays empty if nothing credible was found.`,
        },
      ],
    });

    const textBlock = [...msg.content].reverse().find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = extractJson(raw);
    if (!parsed) {
      return { ...UNAVAILABLE, available: true, summary: raw.slice(0, 600) || "No structured findings returned.", note: "Research ran but returned unstructured output." };
    }

    const dossier: OsintDossier = {
      available: true,
      summary: String(parsed.summary || "").slice(0, 800),
      entities: arr(parsed.entities)
        .map((e: any) => ({ name: String(e?.name || ""), role: String(e?.role || ""), evidence: String(e?.evidence || "") }))
        .filter((e) => e.name)
        .slice(0, 20),
      affiliations: arr(parsed.affiliations).map((a) => String(a)).filter(Boolean).slice(0, 20),
      socialProfiles: arr(parsed.socialProfiles)
        .map((s: any) => ({ platform: String(s?.platform || ""), handle: String(s?.handle || ""), url: String(s?.url || "") }))
        .filter((s) => s.platform || s.handle || s.url)
        .slice(0, 20),
      funding: String(parsed.funding || ""),
      reputation: String(parsed.reputation || ""),
      controversies: arr(parsed.controversies).map((c) => String(c)).filter(Boolean).slice(0, 20),
      relatedSites: arr(parsed.relatedSites).map((d) => String(d)).filter(Boolean).slice(0, 30),
      citations: arr(parsed.citations)
        .map((c: any) => ({ title: String(c?.title || c?.url || ""), url: String(c?.url || "") }))
        .filter((c) => c.url)
        .slice(0, 40),
      confidence: normConfidence(parsed.confidence),
      note: "OSINT findings from open-web research — indicators with sources, not proof. Verify before acting.",
    };

    await cacheSet(`osint:${domain}`, dossier);
    return dossier;
  } catch (e: any) {
    const msg = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(msg)) {
      return { ...UNAVAILABLE, note: "OSINT research paused — the Anthropic account is out of credits. Add credits at console.anthropic.com (Plans & Billing) to re-enable." };
    }
    if (/401|invalid x-api-key|authentication/i.test(msg)) {
      return { ...UNAVAILABLE, note: "OSINT research unavailable — the ANTHROPIC_API_KEY appears invalid." };
    }
    if (/429|rate limit/i.test(msg)) {
      return { ...UNAVAILABLE, note: "OSINT research temporarily rate-limited — try again shortly." };
    }
    return { ...UNAVAILABLE, note: `OSINT research failed: ${msg.slice(0, 160)}.` };
  }
}
