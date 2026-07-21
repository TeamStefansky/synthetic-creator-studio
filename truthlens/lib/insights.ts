// "Insights" — a Cyabra-style AI Q&A over a finished TruthLens report. The user
// asks a question; Claude answers grounded ONLY in the report data, citing the
// signals it used. Server-side; gated behind ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "./llm";
import type { Report } from "./types";

export interface InsightAnswer {
  available: boolean;
  answer: string;
}

/** Compact the (large) report into the signals that matter for Q&A. */
function digest(r: Report): string {
  const i = r.infrastructure;
  const g = r.geography;
  const c = r.contentAnalysis;
  const lines: string[] = [];
  lines.push(`Domain: ${r.domain} (final URL ${r.finalUrl || r.url})`);
  lines.push(`Verdict: ${r.risk.band}, score ${r.risk.score}/100, confidence ${r.risk.confidence}`);
  lines.push(`Evidence: ${r.risk.evidence.map((e) => `${e.label} (${e.impact > 0 ? "+" : ""}${e.impact}) — ${e.detail}`).join("; ")}`);
  if (i.domain.value) lines.push(`Domain info: registrar ${i.domain.value.registrar || "?"}, created ${i.domain.value.createdAt || "?"}, registrant ${i.domain.value.registrantOrg || (i.domain.value.privacyProtected ? "privacy-protected" : "?")}, country ${i.domain.value.registrantCountry || "?"}`);
  if (i.hosting.value) lines.push(`Hosting: IP ${i.hosting.value.ip}, ASN ${i.hosting.value.asnOrg}, country ${i.hosting.value.cdnMasksOrigin ? "CDN edge (masked)" : i.hosting.value.country}, CDN ${i.hosting.value.cdn || "none"}`);
  if (i.authority.value) lines.push(`Authority: domain age ${i.authority.value.domainAgeYears ?? "?"}y, web presence ${i.authority.value.waybackYears ?? "?"}y, level ${i.authority.value.level}`);
  if (g) lines.push(`Geography: server ${g.server?.country || "?"}, registrant ${g.registrantCountry || "?"}, mail ${g.mail.map((m) => m.country).filter(Boolean).join("/") || "?"}, dns ${g.dns.map((d) => d.country).filter(Boolean).join("/") || "?"}`);
  if (r.originTrace) lines.push(`Origin trace: CDN ${r.originTrace.cdn || "none"}, likely origin ${r.originTrace.likelyOrigin?.ip || "hidden"} (${r.originTrace.likelyOrigin?.country || "?"}), ${r.originTrace.candidates.length} candidate IP(s)`);
  const domains = r.network.nodes.filter((n) => n.kind === "domain").map((n) => n.label);
  lines.push(`Operator network: ${domains.length} linked domain(s)${domains.length ? ": " + domains.slice(0, 20).join(", ") : ""}${r.network.note ? ` (note: ${r.network.note})` : ""}`);
  if (c.available) {
    lines.push(`Content: sensationalism ${c.sensationalism}, emotional-manipulation ${c.emotionalManipulation}, sourcing ${c.sourcingQuality}, AI-likelihood ${c.aiGeneratedLikelihood}; intent ${c.intent}; audience ${c.targetAudience}`);
    if (c.narratives.length) lines.push(`Narratives: ${c.narratives.join(" | ")}`);
    if (c.propagandaTechniques.length) lines.push(`Techniques: ${c.propagandaTechniques.join(", ")}`);
    if (c.redFlags.length) lines.push(`Red flags: ${c.redFlags.join("; ")}`);
  }
  if (r.coordination) lines.push(`Coordination likelihood: ${r.coordination.level} — ${r.coordination.signals.map((s) => s.label).join(", ") || "no signals"}`);
  if (r.propagation?.hits.length) lines.push(`Propagation: earliest publisher ${r.propagation.earliestPublisher || "?"}, ${r.propagation.hits.length} republisher(s)`);
  return lines.join("\n");
}

export async function answerReportQuestion(report: Report, question: string): Promise<InsightAnswer> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { available: false, answer: "Insights need ANTHROPIC_API_KEY to be configured on the server." };
  if (!question || question.trim().length < 3) return { available: true, answer: "Please ask a question about this report." };

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 900,
      system:
        "You are TruthLens Insights, an analyst assistant. Answer the user's question using ONLY the provided report data. Be concise, specific, and cite the signals you relied on. If the data doesn't answer it, say so plainly and note what would be needed. Never invent facts not in the data. Frame conclusions as indicators, not verdicts.",
      messages: [
        {
          role: "user",
          content: `REPORT DATA:\n${digest(report)}\n\nQUESTION: ${question.trim()}`,
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "text");
    const answer = block && block.type === "text" ? block.text.trim() : "No answer produced.";
    return { available: true, answer };
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(m))
      return { available: false, answer: "Insights paused — the Anthropic account is out of credits (console.anthropic.com → Plans & Billing)." };
    if (/429|rate limit/i.test(m)) return { available: false, answer: "Rate-limited — try again shortly." };
    return { available: false, answer: `Insights failed: ${m.slice(0, 160)}.` };
  }
}
