// Brand Watch report — a standalone, print-to-PDF HTML dossier for one entity.
// Server-rendered; the browser's "Print → Save as PDF" turns it into a PDF.
// Same engine as the live view; carries all the framing and safeguards.

import { NextRequest } from "next/server";
import { collectMentions } from "@/lib/narrative/sources";
import { computeThreat } from "@/lib/narrative/threat";
import { extractNarratives } from "@/lib/narrative/clusters";
import type { Mention } from "@/lib/narrative/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STATUS_LABEL: Record<string, string> = {
  UNDER_ATTACK: "Under attack", ELEVATED: "Elevated", CALM: "Calm", UNKNOWN: "Unknown",
};

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  if (entity.length < 2) return new Response("entity required", { status: 400 });

  const results = await collectMentions(entity);
  const mentions: Mention[] = results.flatMap((r) => r.mentions);
  const r = computeThreat(entity, mentions, results.map((s) => s.status));
  const narratives = await extractNarratives(entity, mentions);

  const indicators = r.indicators.map((i) => `
    <div class="ind">
      <div class="ind-h"><b>${esc(i.label)}</b><span class="lvl lvl-${i.level.toLowerCase()}">${esc(i.level)}${i.level !== "Unknown" ? " · " + i.score : ""}</span></div>
      <ul>${i.signals.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      <div class="alt"><i>Could also be explained by:</i> ${esc(i.alternative)}</div>
    </div>`).join("");

  const sources = r.sources.map((s) =>
    `<span class="src ${s.connected ? "on" : "off"}">${esc(s.source)}${s.connected ? " · " + s.count : " · not connected"}</span>`).join(" ");

  const narrHtml = narratives.available ? `
    <h2>Narrative analysis <small>(AI-assisted)</small></h2>
    <p>${esc(narratives.assessment)}</p>
    ${narratives.coreClaims.length ? `<p><b>Core claims:</b></p><ul>${narratives.coreClaims.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    ${narratives.clusters.map((c) => `<div class="ind"><div class="ind-h"><b>${esc(c.label)}</b><span class="lvl lvl-${esc(c.hostility)}">${esc(c.hostility)}</span></div><p>${esc(c.summary)}</p><div class="alt"><i>Could also be:</i> ${esc(c.alternative)}</div></div>`).join("")}`
    : `<h2>Narrative analysis</h2><p class="muted">Not connected — ${esc(narratives.reason)}</p>`;

  const evidence = r.evidence.map((e) =>
    `<blockquote>${esc(e.text)}<br><small>${esc(e.source)}${e.account ? " · " + esc(e.account) : ""}${e.url ? ` · <a href="${esc(e.url)}">source</a>` : ""}</small></blockquote>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Brand Watch — ${esc(entity)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:820px;margin:2rem auto;padding:0 1.2rem;color:#111;line-height:1.5}
h1{margin:0 0 .2rem} h2{margin:1.6rem 0 .5rem;border-bottom:1px solid #eee;padding-bottom:.2rem}
.status{font-size:1.3rem;font-weight:800} .score{font-size:2.4rem;font-weight:900}
.s-under_attack{color:#dc2626}.s-elevated{color:#d97706}.s-calm{color:#16a34a}.s-unknown{color:#6b7280}
.meta{color:#666;font-size:.85rem} .ind{border:1px solid #eee;border-radius:8px;padding:.6rem .8rem;margin:.5rem 0}
.ind-h{display:flex;justify-content:space-between;align-items:center} ul{margin:.3rem 0 .3rem 1.1rem;padding:0} li{font-size:.9rem}
.alt{font-size:.82rem;color:#555;margin-top:.3rem} .lvl{font-size:.75rem;font-weight:700;padding:.1rem .5rem;border-radius:999px;background:#f3f4f6}
.lvl-high{background:#fee2e2;color:#dc2626}.lvl-medium{background:#fef3c7;color:#d97706}.lvl-low{background:#dcfce7;color:#16a34a}.lvl-unknown{color:#6b7280}
.src{display:inline-block;font-size:.75rem;padding:.1rem .5rem;border-radius:999px;margin:.1rem;border:1px solid #ddd}
.src.off{color:#999} blockquote{border-left:3px solid #ddd;margin:.5rem 0;padding:.2rem .8rem;background:#fafafa;font-size:.9rem}
.muted{color:#888} .foot{margin-top:2rem;border-top:1px solid #eee;padding-top:.6rem;color:#666;font-size:.8rem}
@media print{body{margin:0}}
</style></head><body>
<h1>Brand Watch — ${esc(entity)}</h1>
<div class="meta">Generated ${esc(r.generatedAt)} · rubric ${esc(r.rubricVersion)}</div>
<p><span class="status s-${esc(r.status.toLowerCase())}">${esc(STATUS_LABEL[r.status] || r.status)}</span> ·
<span class="score s-${esc(r.status.toLowerCase())}">${r.score === null ? "—" : r.score}</span>/100 ·
${r.totalMentions} mentions · ${r.totalAccounts} accounts</p>
${r.note ? `<p class="muted">${esc(r.note)}</p>` : ""}
<h2>Sources</h2><div>${sources}</div>
<h2>Indicators</h2>${indicators || "<p class='muted'>None.</p>"}
${narrHtml}
${r.earliest ? `<h2>Earliest observed <small>— in collected data, not the true origin</small></h2>
<blockquote>${esc(r.earliest.text)}<br><small>${esc(r.earliest.source)}${r.earliest.account ? " · " + esc(r.earliest.account) : ""}${r.earliest.timestamp ? " · " + esc(r.earliest.timestamp) : ""}</small></blockquote>` : ""}
<h2>Evidence <small>— earliest observed in collected data, not proof of origin</small></h2>
${evidence || "<p class='muted'>No evidence captured.</p>"}
<div class="foot">Decision-support tool — not a verdict. Indicators of a coordinated inauthentic campaign, with evidence
and alternative explanations — never an accusation against any person. Analyze only public data you are authorized to inspect.</div>
<script>if(location.hash!=="#noprint"){setTimeout(function(){window.print()},400)}</script>
</body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
