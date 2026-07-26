// Ask-the-Investigator chat. Answers are grounded STRICTLY in the case context the
// client passes (the situation report the agent already produced) — the model
// receives only that structured text, never raw web content, and the case data
// itself contains no person records, so there is nothing to leak. Frozen-rule
// framing: decision-support not a verdict; never name/infer a private individual;
// never claim above the recorded rung; "not in the collected data" is a valid
// answer. Without an LLM key it degrades to an honest keyword lookup, never faked.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM = [
  "You are the TruthLens Investigator's Q&A. Answer ONLY from the CASE CONTEXT provided below.",
  "Rules you cannot break:",
  "- Never name or infer a private individual. Talk about domains, IPs, ASNs, hosting operators, and organizations only.",
  "- Never claim more than the recorded rung. Do not assert that a named actor/person/state is responsible.",
  "- State likelihood and confidence separately when relevant; a co-hosted/shared-infra match is context, not proof.",
  "- If the answer is not in the context, say exactly: 'That is not in the collected data.' Do not speculate or invent.",
  "- Decision-support, not a verdict. Be concise (3-6 sentences). Reference the report section(s) you used.",
].join("\n");

// Keyless fallback: return the report sections most relevant to the question.
function keywordAnswer(question: string, context: string): string {
  const terms = question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const blocks = context.split(/\n(?=## )/);
  const scored = blocks
    .map((b) => ({ b, score: terms.reduce((s, t) => s + (b.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((x) => x.b.trim());
  if (!scored.length) return "That is not in the collected data. (Conversational answers need an LLM key; connect ANTHROPIC_API_KEY for full Q&A.)";
  return `${scored.join("\n\n")}\n\n(Conversational answers need an LLM key; the above is the relevant part of the report.)`;
}

export async function POST(req: Request) {
  let body: any = {}; try { body = await req.json(); } catch { /* handled */ }
  const question = (body?.question || "").toString().slice(0, 500).trim();
  const context = (body?.context || "").toString().slice(0, 8000);
  if (!question) return NextResponse.json({ error: "ask a question" }, { status: 400 });
  if (!context) return NextResponse.json({ error: "run an investigation first, then ask about it" }, { status: 400 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ connected: false, answer: keywordAnswer(question, context) }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 600,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: `CASE CONTEXT:\n${context}\n\nQUESTION: ${question}` }],
    });
    const answer = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("").trim() || "That is not in the collected data.";
    return NextResponse.json({ connected: true, answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const m = /credit|billing/i.test(e?.message || "") ? "Q&A paused — the Anthropic account is out of credits." : "Q&A unavailable right now.";
    return NextResponse.json({ connected: false, answer: keywordAnswer(question, context), note: m }, { headers: { "Cache-Control": "no-store" } });
  }
}
