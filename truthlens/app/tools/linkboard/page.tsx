"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Network, ArrowRight, ChevronDown, ChevronRight, ExternalLink, ShieldQuestion } from "lucide-react";

// Force-directed operator-network graph (same component Site Report uses).
// ssr:false - react-force-graph needs the browser.
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), { ssr: false });
import Disclaimer from "@/components/Disclaimer";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import ToolIntro from "@/components/ToolIntro";
import type { BoardResult, PairEdge } from "@/lib/board/types";
import type { ConfidenceLevel } from "@/components/ConfidenceBadge";

// Link Board - calibrated domain/infrastructure overlap. Nodes are domains/infra
// (never people); every overlap carries evidence + an alternative; common-by-
// default facts (nginx, WordPress, Cloudflare) never create an edge. Decision
// support, not a verdict.

const CELL: Record<ConfidenceLevel, { bg: string; label: string }> = {
  High: { bg: "rgba(169,139,240,0.85)", label: "Strong" },
  Medium: { bg: "rgba(169,139,240,0.45)", label: "Moderate" },
  Low: { bg: "rgba(169,139,240,0.18)", label: "Weak" },
  Unknown: { bg: "transparent", label: "—" },
};

function EdgeCard({ edge }: { edge: PairEdge }) {
  const [open, setOpen] = useState(edge.strength === "High");
  const [showWeak, setShowWeak] = useState(false);
  const strong = edge.items.filter((i) => i.countsToward);
  const weak = edge.items.filter((i) => !i.countsToward);
  return (
    <div className="card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-secondary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-secondary" />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{edge.a} <span className="text-ink-muted">↔</span> {edge.b}</div>
          <div className="truncate text-xs text-ink-secondary">
            {edge.top ? <>top: {edge.top.display} · </> : null}{edge.overlapCount} overlap{edge.overlapCount === 1 ? "" : "s"}
          </div>
        </div>
        <ConfidenceBadge level={edge.strength} label={CELL[edge.strength].label} />
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          {strong.length === 0 && (
            <p className="text-xs text-ink-secondary">Only common-by-default overlaps below — informational, they don&apos;t establish a link.</p>
          )}
          {strong.map((it, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-2">
                <ConfidenceBadge level={it.strength} label={CELL[it.strength].label} />
                <span className="text-sm font-medium text-ink">{it.display}</span>
                <span className="ml-auto text-[11px] uppercase tracking-wide text-ink-muted">{it.source}</span>
              </div>
              {it.commonness != null && (
                <div className="mt-1 text-xs text-ink-secondary">measured commonness: ~{it.commonness} neighbour(s) on the shared host</div>
              )}
              <div className="mt-1 flex items-start gap-1 text-xs text-ink-secondary">
                <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0" /> <span>{it.alternative}</span>
              </div>
            </div>
          ))}

          {weak.length > 0 && (
            <div>
              <button onClick={() => setShowWeak((v) => !v)} className="text-xs text-brand-soft hover:underline">
                {showWeak ? "Hide" : "Show"} {weak.length} weak / common-by-default overlap{weak.length === 1 ? "" : "s"}
              </button>
              {showWeak && (
                <div className="mt-2 space-y-1.5">
                  {weak.map((it, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-ink-secondary">
                      <span className="mt-0.5 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{CELL[it.strength].label}</span>
                      <span><span className="text-ink">{it.display}</span> — {it.alternative}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LinkBoardPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Prefill + auto-run from ?domains= (used by Site Report's "Compare in Link Board").
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("domains");
    if (q && q.trim()) { setInput(q.split(/[\s,]+/).filter(Boolean).join("\n")); compare(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compare = async (raw?: string) => {
    const domains = (raw ?? input).split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    if (domains.length < 2) { setError("Enter at least two domains (comma or newline separated)."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/linkboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains }), cache: "no-store",
      });
      const txt = await r.text();
      let data: any; try { data = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || "unreadable response"); }
      if (!r.ok) throw new Error(data.error || `comparison failed (${r.status})`);
      setResult(data);
    } catch (e: any) { setError(e?.message || "comparison failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Link <span className="gradient-text">Board</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Compare a set of domains across their full server/infrastructure fingerprint and any other
          public artifact they expose - each overlap scored by how much it actually discriminates, with
          evidence and an alternative. Common-by-default facts (nginx, WordPress, Cloudflare, shared CDN
          certs) never draw an edge. Nodes are domains/infrastructure, never people.
        </p>
      </div>

      <div className="card">
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          placeholder={"Enter 2-12 domains, one per line or comma-separated\ne.g.\nexample.com\nexample.org"}
          className="h-28 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-sm outline-none focus:border-brand scroll-thin"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-secondary">Public data + ordinary HTTP only. Cached per day for reproducibility.</p>
          <button onClick={() => compare()} disabled={loading} className="btn shrink-0">
            {loading ? "Comparing…" : <>Compare <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="Which of these sites are actually connected?"
          what={<>Paste a set of domains. TruthLens builds each one&apos;s <span className="text-ink">infrastructure fingerprint</span> (IP/ASN, TLS SANs, DNS, registrar) plus any <span className="text-ink">shared artifact</span> (analytics/tag IDs, embedded origins, outbound links, org contact, boilerplate), then scores every pair by how <span className="text-ink">discriminating</span> the overlap is - so two sites that merely share Cloudflare and WordPress don&apos;t look &ldquo;linked,&rdquo; but two sharing a unique analytics ID or a non-wildcard certificate do.</>}
          legend={[
            { label: "Strong", tone: "high", text: "a deliberate/near-unique shared artifact (unique cert, self-hosted analytics id)." },
            { label: "Moderate", tone: "unknown", text: "a distinctive-but-calibrated overlap (dedicated shared IP)." },
            { label: "Weak", tone: "neutral", text: "common-by-default facts - shown, but never establish a link alone." },
          ]}
          note="Every edge lists its evidence and an alternative explanation. Org-published contact only - never personal addresses, emails, or phones."
        />
      )}

      {result && (
        <div className="space-y-6">
          {/* operator network graph - the visual "who is connected to whom" */}
          <div className="card">
            <div className="label-muted mb-2 flex items-center gap-1"><Network className="h-3.5 w-3.5" /> Operator network</div>
            {result.network && result.network.nodes.length > 1 ? (
              <>
                <NetworkGraph network={result.network as any} />
                {result.network.note && <p className="mt-2 text-[11px] text-ink-secondary">{result.network.note}</p>}
              </>
            ) : (
              <p className="text-sm text-ink-secondary">
                No shared infrastructure or reverse-IP neighbours were collected for these domains, so there is no network to draw.
                Check the collection status below - if sources show issues, the lookups were blocked/rate-limited, not that the domains are unrelated.
              </p>
            )}
          </div>

          {/* overlap matrix */}
          <div className="card">
            <div className="label-muted mb-2 flex items-center gap-1"><Network className="h-3.5 w-3.5" /> Overlap matrix</div>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th></th>
                    {result.entities.map((e) => (
                      <th key={e} className="p-1 text-[10px] font-normal text-ink-secondary" style={{ writingMode: "vertical-rl" }} title={e}>{e}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.entities.map((rowE, i) => (
                    <tr key={rowE}>
                      <td className="whitespace-nowrap pr-2 text-right text-xs text-ink-secondary" title={rowE}>{rowE}</td>
                      {result.entities.map((colE, j) => {
                        const s = i === j ? null : result.matrix[i][j];
                        return (
                          <td key={colE} className="h-7 w-7 rounded text-center align-middle"
                            title={i === j ? "" : `${rowE} ↔ ${colE}: ${s ? CELL[s].label : "no meaningful overlap"}`}
                            style={{ background: i === j ? "rgba(255,255,255,0.04)" : (s ? CELL[s].bg : "rgba(255,255,255,0.02)") }}>
                            {i === j ? <span className="text-ink-muted">·</span> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-secondary">
              {(["High", "Medium", "Low"] as ConfidenceLevel[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded" style={{ background: CELL[k].bg }} /> {CELL[k].label}
                </span>
              ))}
            </div>
          </div>

          {/* edges */}
          <div className="space-y-3">
            <div className="label-muted">Connected pairs ({result.edges.length})</div>
            {result.edges.length === 0 ? (
              <div className="card text-sm text-ink-secondary">No pair shares a discriminating artifact — only common-by-default facts, which don&apos;t establish a link. That is a valid, common result.</div>
            ) : (
              result.edges.map((e, i) => <EdgeCard key={i} edge={e} />)
            )}
          </div>

          {/* sources / collection status */}
          <div className="card">
            <div className="label-muted mb-2">Collection status</div>
            <div className="flex flex-wrap gap-2">
              {result.fingerprints.map((f) => (
                <span key={f.entity} title={f.errors.join("; ") || `${f.artifactCount} artifacts collected`}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${f.errors.length ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-200/80" : "border-white/15 text-ink-secondary"}`}>
                  {f.entity} · {f.artifactCount} artifact{f.artifactCount === 1 ? "" : "s"}{f.errors.length ? ` · ${f.errors.length} source issue(s)` : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-secondary">Rubric {result.rubricVersion} · same fingerprints + rubric ⇒ identical result.</p>
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
