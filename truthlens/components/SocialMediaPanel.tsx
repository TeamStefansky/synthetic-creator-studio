"use client";

import { useState } from "react";
import { Radio, Loader2, Bot, Image as ImageIcon, AlertTriangle, BadgeCheck } from "lucide-react";
import type { Report, SocialResult, MediaResult, SocialAccount } from "@/lib/types";

export default function SocialMediaPanel({ report }: { report: Report }) {
  const [social, setSocial] = useState<SocialResult | null>(null);
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    setRan(true);
    try {
      const r = await fetch("/api/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: report.domain, images: report.media?.images || [] }),
      });
      const data = await r.json();
      setSocial(data.social);
      setMedia(data.media);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Social &amp; Media Intelligence</h2>
        </div>
        {!loading && (
          <button className="btn-ghost text-sm" onClick={run}>
            {ran ? "Re-scan" : "Run scan"}
          </button>
        )}
      </div>

      {!ran && !loading && (
        <p className="text-sm text-gray-400">
          Find who is amplifying this site on X, estimate the share of
          inauthentic/bot accounts and the top spreaders, and check the page&rsquo;s
          images for AI-generation / deepfakes. Runs on demand (needs the relevant API keys).
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> Scanning X and images…
        </div>
      )}

      {ran && !loading && (
        <div className="space-y-5">
          {/* Social */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-200">
              <Bot className="h-4 w-4" /> X amplification
            </div>
            {!social?.available ? (
              <p className="text-sm text-yellow-300/90">{social?.note || "Unavailable."}</p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 gap-3">
                  <Stat label="Posts" value={String(social.totalPosts)} />
                  <Stat label="Accounts" value={String(social.uniqueAuthors)} />
                  <Stat label="Suspected bots" value={`${social.suspectedBotPct}%`} accent={social.suspectedBotPct >= 40 ? "text-risk-high" : social.suspectedBotPct >= 20 ? "text-risk-unknown" : "text-risk-legit"} />
                </div>
                {social.topSpreaders.length > 0 && (
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-gray-400">
                        <tr className="border-b border-white/10">
                          <th className="py-1.5 pr-3">Account</th><th className="pr-3">Followers</th><th className="pr-3">Engagement</th><th>Bot score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {social.topSpreaders.map((s) => <Spreader key={s.handle} s={s} />)}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">{social.note}</p>
              </>
            )}
          </div>

          {/* Media */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-200">
              <ImageIcon className="h-4 w-4" /> Image AI / deepfake detection
            </div>
            {!media?.available ? (
              <p className="text-sm text-yellow-300/90">{media?.note || "Unavailable."}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {media.images.map((img) => (
                  <div key={img.url} className="rounded-lg border border-white/10 bg-bg-elev p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="mb-2 h-28 w-full rounded object-cover" />
                    <div className={`flex items-center gap-1 text-xs font-medium ${img.aiGeneratedScore >= 70 ? "text-risk-high" : img.aiGeneratedScore >= 40 ? "text-risk-unknown" : "text-risk-legit"}`}>
                      {img.aiGeneratedScore >= 40 ? <AlertTriangle className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                      {img.label}
                    </div>
                    <div className="text-xs text-gray-500">AI {img.aiGeneratedScore}%{img.deepfakeScore != null ? ` · deepfake ${img.deepfakeScore}%` : ""} · {img.provider}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">Probabilistic indicators, not proof.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card-elev text-center">
      <div className="label-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent || ""}`}>{value}</div>
    </div>
  );
}

function Spreader({ s }: { s: SocialAccount }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-1.5 pr-3">
        <a href={`https://x.com/${s.handle}`} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">@{s.handle}</a>
      </td>
      <td className="pr-3 text-gray-300">{s.followers ?? " - "}</td>
      <td className="pr-3 text-gray-300">{s.engagement ?? 0}</td>
      <td>
        <span className={`rounded px-1.5 py-0.5 text-xs ${s.botScore >= 50 ? "bg-risk-high/15 text-risk-high" : s.botScore >= 30 ? "bg-risk-unknown/15 text-risk-unknown" : "bg-risk-legit/15 text-risk-legit"}`} title={s.reasons.join("; ")}>
          {s.botScore}
        </span>
      </td>
    </tr>
  );
}
