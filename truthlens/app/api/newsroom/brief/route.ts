// NEWS ROOM - on-demand situational brief. Given the headlines currently shown
// (already collected + translated by /api/newsroom), an editor-style LLM pass groups
// them into a few themes, each citing the supporting headlines by index so the UI can
// link every claim back to a source. Grounded in the supplied headlines only - the
// model is told to invent nothing. Honest capability: no ANTHROPIC_API_KEY →
// { available:false } (never a fabricated brief).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 40;

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ available: false, reason: "AI brief unavailable - ANTHROPIC_API_KEY not configured." });

  let body: any = {};
  try { body = await req.json(); } catch { /* handled */ }
  const items: { title: string; outlet?: string }[] = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (items.length < 2) return NextResponse.json({ available: false, reason: "Not enough headlines for a brief." });

  const lines = items.map((it, i) => `${i}: ${(it.title || "").replace(/\s+/g, " ").slice(0, 200)}${it.outlet ? ` (${it.outlet})` : ""}`).join("\n");
  const system =
    "You are a news-desk editor. You are given numbered English headlines that are ALREADY collected. " +
    "Group them into 3–6 themes describing what is happening right now. Each theme is ONE factual sentence, " +
    "strictly grounded in the headlines - invent no fact, number, name or event not present in them. For each " +
    'theme list the indexes of the headlines that support it. Respond with ONLY minified JSON: ' +
    '{"themes":[{"text":"<one sentence>","refs":[<index>,...]}]}';

  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 });
    const msg = await client.messages.create({
      model: LLM_MODEL, max_tokens: 1200, system,
      messages: [{ role: "user", content: `Headlines:\n${lines}` }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return NextResponse.json({ available: false, reason: "Brief returned unreadable output." });
    const parsed = JSON.parse(raw.slice(s, e + 1));
    const themes = (parsed?.themes || [])
      .map((t: any) => ({
        text: typeof t?.text === "string" ? t.text.trim() : "",
        refs: Array.isArray(t?.refs) ? t.refs.filter((n: any) => Number.isInteger(n) && n >= 0 && n < items.length) : [],
      }))
      .filter((t: any) => t.text && t.refs.length);
    if (!themes.length) return NextResponse.json({ available: false, reason: "Brief returned no usable themes." });
    return NextResponse.json({ available: true, themes, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|insufficient/i.test(m)) return NextResponse.json({ available: false, reason: "AI brief paused - Anthropic account out of credits." });
    if (/401|authentication|invalid x-api-key/i.test(m)) return NextResponse.json({ available: false, reason: "AI brief unavailable - API key appears invalid." });
    if (/429|rate limit/i.test(m)) return NextResponse.json({ available: false, reason: "AI brief rate-limited - try again shortly." });
    return NextResponse.json({ available: false, reason: `AI brief failed: ${m.slice(0, 120)}` });
  }
}
