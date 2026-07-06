"use client";

import { useState } from "react";
import { ShieldQuestion, Loader2, ExternalLink, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import type { PostCheckResult, PostVerdict } from "@/lib/types";
import Disclaimer from "@/components/Disclaimer";

function verdictStyle(v: PostVerdict) {
  switch (v) {
    case "Likely False": return { cls: "text-risk-high border-risk-high/40 bg-risk-high/10", icon: <XCircle className="h-6 w-6" /> };
    case "Misleading": return { cls: "text-risk-unknown border-risk-unknown/40 bg-risk-unknown/10", icon: <AlertTriangle className="h-6 w-6" /> };
    case "Likely True": return { cls: "text-risk-legit border-risk-legit/40 bg-risk-legit/10", icon: <CheckCircle2 className="h-6 w-6" /> };
    case "Opinion or Satire": return { cls: "text-indigo-300 border-indigo-400/40 bg-indigo-500/10", icon: <HelpCircle className="h-6 w-6" /> };
    default: return { cls: "text-gray-300 border-white/20 bg-white/5", icon: <ShieldQuestion className="h-6 w-6" /> };
  }
}

function claimIcon(v: string) {
  const s = v.toLowerCase();
  if (s.includes("support")) return <CheckCircle2 className="h-4 w-4 text-risk-legit" />;
  if (s.includes("contradict")) return <XCircle className="h-4 w-4 text-risk-high" />;
  if (s.includes("mislead")) return <AlertTriangle className="h-4 w-4 text-risk-unknown" />;
  return <HelpCircle className="h-4 w-4 text-gray-400" />;
}

export default function PostCheckPage() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<PostCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    setRes(null);
    try {
      const r = await fetch("/api/post-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Check failed");
      setRes(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldQuestion className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Post Check — is it fake?</h1>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Paste a social-media post, message, or claim (or a link to an article). We extract the
          factual claims, verify them against the open web, and return a verdict with sources.
        </p>
      </div>

      <div className="card">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the post / claim / forwarded message here — or a URL to an article…"
          className="h-40 w-full rounded-xl border border-white/15 bg-bg-elev p-3 text-sm outline-none focus:border-indigo-400 scroll-thin"
        />
        <div className="mt-3 flex items-center gap-3">
          <button className="btn" onClick={run} disabled={loading || text.trim().length < 5}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : "Check this post"}
          </button>
          {error && <span className="text-sm text-risk-high">{error}</span>}
        </div>
      </div>

      {res && (
        <div className="space-y-4">
          {!res.available ? (
            <div className="card text-sm text-yellow-300/90">{res.summary || res.note}</div>
          ) : (
            <>
              <div className={`card flex items-center gap-4 border ${verdictStyle(res.verdict).cls}`}>
                {verdictStyle(res.verdict).icon}
                <div>
                  <div className="text-xl font-bold">{res.verdict}</div>
                  <div className="text-xs text-gray-400">Confidence: {res.confidence}</div>
                </div>
              </div>

              <div className="card">
                <p className="text-sm text-gray-200">{res.summary}</p>
              </div>

              {res.claims.length > 0 && (
                <div className="card">
                  <h2 className="mb-3 text-lg font-semibold">Claims checked</h2>
                  <ul className="space-y-2">
                    {res.claims.map((c, i) => (
                      <li key={i} className="rounded-lg border border-white/10 bg-bg-elev p-3">
                        <div className="flex items-start gap-2">
                          {claimIcon(c.verdict)}
                          <div>
                            <div className="text-sm font-medium text-gray-100">{c.claim}</div>
                            <div className="text-xs uppercase tracking-wide text-gray-500">{c.verdict}</div>
                            {c.assessment && <div className="mt-1 text-sm text-gray-400">{c.assessment}</div>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {res.manipulationTechniques.length > 0 && (
                  <div className="card">
                    <h3 className="mb-2 font-semibold">Manipulation techniques</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {res.manipulationTechniques.map((t, i) => (
                        <span key={i} className="rounded-lg border border-risk-high/30 bg-risk-high/5 px-2 py-1 text-xs text-risk-high/90">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="card">
                  <h3 className="mb-2 font-semibold">AI-generated likelihood</h3>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-gray-400">Score</span><span>{res.aiGeneratedLikelihood}/100</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full ${res.aiGeneratedLikelihood > 60 ? "bg-risk-high" : res.aiGeneratedLikelihood > 40 ? "bg-risk-unknown" : "bg-risk-legit"}`} style={{ width: `${res.aiGeneratedLikelihood}%` }} />
                  </div>
                  {res.redFlags.length > 0 && (
                    <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-risk-high/90">
                      {res.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </div>
              </div>

              {res.sources.length > 0 && (
                <div className="card">
                  <h3 className="mb-2 font-semibold">Sources</h3>
                  <ul className="space-y-1 text-sm">
                    {res.sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-indigo-400 hover:underline">
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.title || s.url}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-gray-500">{res.note}</p>
            </>
          )}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
