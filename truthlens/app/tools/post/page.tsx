"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldQuestion, Loader2, ExternalLink, AlertTriangle, CheckCircle2, XCircle,
  HelpCircle, Upload, X, Share2, Check, Code, LayoutGrid,
} from "lucide-react";
import type { PostCheckResult, PostVerdict } from "@/lib/types";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";

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

function PostCheckInner() {
  const params = useSearchParams();
  const sharedId = params.get("s");

  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; base64: string; mediaType: string } | null>(null);
  const [res, setRes] = useState<PostCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [shared, setShared] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);

  // Load a shared result if ?s=<id> is present.
  useEffect(() => {
    if (!sharedId) return;
    setLoading(true);
    fetch(`/api/share?id=${encodeURIComponent(sharedId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.result) { setRes(d.result); setShared(true); } else setError(d.error || "Shared result not found."); })
      .catch(() => setError("Could not load shared result."))
      .finally(() => setLoading(false));
  }, [sharedId]);

  const onFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.split(",")[1] || "";
      setImage({ dataUrl, base64, mediaType: file.type });
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const run = async (textArg?: string) => {
    const t = textArg ?? text;
    setLoading(true);
    setError("");
    setRes(null);
    setShareMsg("");
    try {
      const r = await fetch("/api/post-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(image ? { text: t, imageBase64: image.base64, mediaType: image.mediaType } : { text: t }),
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

  const ensureShareId = async (): Promise<string | null> => {
    if (shareId) return shareId;
    if (!res) return null;
    const r = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: res }),
    });
    if (!r.ok) return null;
    const { id } = await r.json();
    setShareId(id);
    return id;
  };

  const share = async () => {
    if (!res) return;
    setShareMsg("");
    try {
      const id = await ensureShareId();
      if (id) {
        await navigator.clipboard.writeText(`${window.location.origin}/tools/post?s=${id}`);
        setShareMsg("Share link copied to clipboard!");
      } else {
        await navigator.clipboard.writeText(`TruthLens Post Check — ${res.verdict} (${res.confidence} confidence)\n${res.summary}`);
        setShareMsg("No share store configured — copied a text summary instead.");
      }
    } catch {
      setShareMsg("Could not create share link.");
    }
  };

  const embed = async () => {
    if (!res) return;
    setShareMsg("");
    const id = await ensureShareId();
    if (!id) { setShareMsg("Embedding needs a KV store connected."); return; }
    const snippet = `<iframe src="${window.location.origin}/embed/post?s=${id}" width="380" height="260" style="border:0" loading="lazy"></iframe>`;
    try { await navigator.clipboard.writeText(snippet); setShareMsg("Embed code copied to clipboard!"); }
    catch { setShareMsg("Could not copy embed code."); }
  };

  const canRun = !loading && (text.trim().length >= 5 || !!image);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldQuestion className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Post Check — is it fake?</h1>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Paste a post, message, or claim — <strong>or upload a screenshot</strong> — and we extract the
          claims, verify them against the open web, and return a verdict with sources.
        </p>
        <Link href="/checks" className="mt-2 inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:underline">
          <LayoutGrid className="h-4 w-4" /> Recent shared checks
        </Link>
      </div>

      {!shared && (
        <div className="card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the post / claim / forwarded message here — or a URL to an article…"
            className="h-32 w-full rounded-xl border border-white/15 bg-bg-elev p-3 text-sm outline-none focus:border-indigo-400 scroll-thin"
          />

          {/* Screenshot upload */}
          {image ? (
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt="screenshot" className="h-20 w-20 rounded-lg border border-white/10 object-cover" />
              <button className="btn-ghost text-sm" onClick={() => setImage(null)}><X className="h-4 w-4" /> Remove image</button>
            </div>
          ) : (
            <label
              className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-4 text-sm text-gray-400 hover:border-indigo-400/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
            >
              <Upload className="h-4 w-4" /> Drag &amp; drop a screenshot of the post, or click to upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || undefined)} />
            </label>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button className="btn" onClick={() => run()} disabled={!canRun}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : "Check this post"}
            </button>
            {error && <span className="text-sm text-risk-high">{error}</span>}
          </div>
        </div>
      )}

      {!res && !loading && !shared && (
        <ToolIntro
          what={<>Got a message, tweet, or forwarded claim and want to know if it’s true? Paste the text (or a screenshot). We pull out the factual claims, check each one against the open web, and return a verdict with the sources we used — plus an estimate of whether the text was AI-generated.</>}
          examplesLabel="Try a claim"
          examples={[
            { label: "A viral health myth", onClick: () => { const v = "Drinking celery juice every morning cures cancer."; setText(v); run(v); } },
            { label: "A checkable fact", onClick: () => { const v = "The James Webb Space Telescope launched in December 2021."; setText(v); run(v); } },
          ]}
          legend={[
            { label: "Likely False", tone: "high", text: "the claims contradict reliable sources." },
            { label: "Misleading", tone: "unknown", text: "partly true but missing context or spun." },
            { label: "Likely True", tone: "legit", text: "the claims are supported by reliable sources." },
            { label: "Opinion / Satire / Unknown", tone: "neutral", text: "not a factual claim, or not enough to verify." },
          ]}
          note="“AI-generated likelihood” is a heuristic estimate, not proof. Always read the sources we cite before deciding."
        />
      )}

      {loading && shared && (
        <div className="card flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> Loading shared result…</div>
      )}

      {res && (
        <div className="space-y-4">
          {!res.available ? (
            <div className="card text-sm text-yellow-300/90">{res.summary || res.note}</div>
          ) : (
            <>
              <div className={`card flex items-center justify-between gap-4 border ${verdictStyle(res.verdict).cls}`}>
                <div className="flex items-center gap-4">
                  {verdictStyle(res.verdict).icon}
                  <div>
                    <div className="text-xl font-bold">{res.verdict}</div>
                    <div className="text-xs text-gray-400">Confidence: {res.confidence}</div>
                  </div>
                </div>
                {!shared && (
                  <div className="flex gap-2 no-print">
                    <button className="btn-ghost text-sm" onClick={share} title="Copy a shareable link">
                      <Share2 className="h-4 w-4" /> Share
                    </button>
                    <button className="btn-ghost text-sm" onClick={embed} title="Copy an embed code">
                      <Code className="h-4 w-4" /> Embed
                    </button>
                  </div>
                )}
              </div>
              {shareMsg && <p className="flex items-center gap-1.5 text-xs text-risk-legit"><Check className="h-3.5 w-3.5" />{shareMsg}</p>}

              <div className="card"><p className="text-sm text-gray-200">{res.summary}</p></div>

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

export default function PostCheckPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-gray-400">Loading…</div>}>
      <PostCheckInner />
    </Suspense>
  );
}
