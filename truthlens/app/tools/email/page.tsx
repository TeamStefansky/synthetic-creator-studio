"use client";

import { useState } from "react";
import { Mail, MapPin, ShieldAlert, ShieldCheck, ArrowDown } from "lucide-react";
import type { EmailTraceResult } from "@/lib/types";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";

// A safe, fictional sample (no real brand) that demonstrates a spoofed email:
// "from" a bank, but sent from an unrelated host with SPF/DKIM/DMARC failing.
const SAMPLE_EMAIL = [
  "Delivered-To: you@example.com",
  "Received: from mail.unknown-sender.example (mail.unknown-sender.example [185.12.34.56])",
  "\tby mx.google.com with ESMTPS id abc123",
  "\tfor <you@example.com>; Tue, 10 Oct 2023 06:55:36 -0700 (PDT)",
  "Received: from localhost (unknown [10.0.0.5])",
  "\tby mail.unknown-sender.example; Tue, 10 Oct 2023 13:55:35 +0000",
  "Authentication-Results: mx.google.com;",
  "       spf=fail (google.com: domain does not designate 185.12.34.56 as permitted sender) smtp.mailfrom=acme-bank.example;",
  "       dkim=none;",
  "       dmarc=fail (p=REJECT) header.from=acme-bank.example",
  'From: "Acme Bank Security" <security@acme-bank.example>',
  "Subject: Your account has been limited",
].join("\n");

export default function EmailPage() {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<EmailTraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const trace = async (rawArg?: string) => {
    const value = rawArg ?? raw;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/email-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: value }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Trace failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Email Header Tracer</h1>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Paste the raw source of an email you received. We reconstruct the hop
          path (origin first), geolocate each hop, infer the true origin, and
          evaluate SPF/DKIM/DMARC for a spoofing verdict.
        </p>
      </div>

      <div className="card">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste raw email source / full headers here (must include the Received: lines)…"
          className="h-44 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-xs outline-none focus:border-indigo-400 scroll-thin"
        />
        <div className="mt-3 flex items-center gap-3">
          <button className="btn" onClick={() => trace()} disabled={loading || !raw.trim()}>
            {loading ? "Tracing…" : "Trace origin"}
          </button>
          {error && <span className="text-sm text-risk-high">{error}</span>}
        </div>
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="What is this, and how do I get the headers?"
          what={<>Every email carries hidden <span className="text-gray-200">headers</span> that record the servers it passed through. Pasting them lets us reconstruct the route, estimate where it really came from, and check whether the sender was faked (spoofed). To get them: in <span className="text-gray-200">Gmail</span> open the email → ⋮ → <span className="text-gray-200">Show original</span>; in <span className="text-gray-200">Outlook</span> → File → Properties → <span className="text-gray-200">Internet headers</span>; in <span className="text-gray-200">Apple Mail</span> → View → Message → <span className="text-gray-200">Raw Source</span>. Copy all of it and paste here.</>}
          examplesLabel="No email handy?"
          examples={[{ label: "Load a sample (spoofed) email", onClick: () => { setRaw(SAMPLE_EMAIL); trace(SAMPLE_EMAIL); } }]}
          legend={[
            { label: "SPF", tone: "neutral", text: "was the sending server allowed to send for that domain?" },
            { label: "DKIM", tone: "neutral", text: "is the message cryptographically signed and untampered?" },
            { label: "DMARC", tone: "neutral", text: "the domain’s policy tying SPF/DKIM to the visible “From”." },
            { label: "Spoofing verdict", tone: "high", text: "when these fail, the “From” address was likely faked." },
          ]}
          note="Analyze only emails you received or are authorized to inspect. Geolocation is approximate; relays and privacy services can obscure the true origin."
        />
      )}

      {result && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <div className="label-muted">Inferred true origin</div>
              <div className="mt-1 flex items-center gap-2 text-lg font-bold">
                <MapPin className="h-5 w-5 text-indigo-400" />
                {result.originIp || "Unknown"}
                {result.originCountry && <span className="text-gray-400">· {result.originCountry}</span>}
              </div>
              {result.originIsAdversary && (
                <p className="mt-1 text-sm text-risk-high">⚠ Origin country is in your adversary list.</p>
              )}
            </div>
            <div className={`card ${result.auth.spoofingLikely ? "border-risk-high/40" : ""}`}>
              <div className="label-muted">Spoofing verdict</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                {result.auth.spoofingLikely ? <ShieldAlert className="h-5 w-5 text-risk-high" /> : <ShieldCheck className="h-5 w-5 text-risk-legit" />}
                {result.auth.verdict}
              </div>
              <div className="mt-2 flex gap-3 text-xs text-gray-400">
                <span>SPF: {result.auth.spf || "—"}</span>
                <span>DKIM: {result.auth.dkim || "—"}</span>
                <span>DMARC: {result.auth.dmarc || "—"}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-lg font-semibold">Hop path (origin → destination)</h2>
            <ol className="space-y-2">
              {result.hops.map((hop, i) => (
                <li key={i}>
                  <div className="card-elev">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono text-xs">
                        <span className="text-gray-500">#{hop.index} </span>
                        {hop.from && <span>from <span className="text-gray-200">{hop.from}</span> </span>}
                        {hop.by && <span className="text-gray-500">by {hop.by}</span>}
                      </div>
                      {hop.ip && (
                        <div className="text-xs">
                          <span className="font-mono text-indigo-300">{hop.ip}</span>
                          {hop.enrichment?.country && <span className="text-gray-400"> · {hop.enrichment.country}</span>}
                          {hop.enrichment?.isAdversary && <span className="text-risk-high"> ⚠</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {i < result.hops.length - 1 && (
                    <div className="flex justify-center py-0.5 text-gray-600"><ArrowDown className="h-3 w-3" /></div>
                  )}
                </li>
              ))}
              {result.hops.length === 0 && <p className="text-sm text-gray-500">No Received: hops parsed.</p>}
            </ol>
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
