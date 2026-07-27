// Public landing page (pre-auth), in the new design language: near-black canvas,
// violet primary, cyan accent. Markets the platform's mission and routes to /login.
// Keeps the frozen "decision-support, not a verdict" framing.

import Link from "next/link";
import { ArrowRight, ShieldCheck, Radar, Share2, Network, Globe2, GitCompareArrows } from "lucide-react";

export const metadata = { title: "TruthLens - detect fake news & foreign-influence infrastructure" };

const FEATURES = [
  { icon: ShieldCheck, title: "Post Check", body: "Paste a post or a screenshot. We extract the claims, verify them against the open web, and forensically check the image itself - miscaptioned and AI-generated photos included." },
  { icon: Radar, title: "Narrative monitoring", body: "Watch a brand or topic across news and social sources. Coordination, amplification and foreign-influence indicators - with the operator network behind a narrative." },
  { icon: Network, title: "Infrastructure OSINT", body: "Expose the hosting, network and operator behind a site - who else sits on it, and documented sanctions / state-media / foreign-agent context, each cited." },
  { icon: GitCompareArrows, title: "The bridge", body: "Cross-links tie it together: a site's infrastructure is checked against documented lists and the narratives you monitor - both directions." },
  { icon: Share2, title: "Link & Case boards", body: "Compare domains across shared infrastructure, then compose an evidence-grounded case with a chain-of-custody ledger and an autonomous investigator." },
  { icon: Globe2, title: "Geopolitics picture", body: "Conflict, humanitarian, disaster and forecast signals from official sources - situational context for what you are investigating." },
];

export default function WelcomePage({ searchParams }: { searchParams?: { next?: string } }) {
  const next = searchParams?.next && searchParams.next.startsWith("/") ? searchParams.next : "";
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080f] text-[#e8eaf2]">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[#7c3aed]/20 blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 -right-24 h-[420px] w-[420px] rounded-full bg-[#22d3ee]/10 blur-[130px]" />

      {/* Top bar */}
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-monogram.svg" alt="" className="h-8 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-wordmark.svg" alt="TruthLens" className="h-4 w-auto" />
        </div>
        <Link href={loginHref} className="rounded-xl border border-[#7c3aed]/30 px-4 py-2 text-sm text-[#e8eaf2] transition hover:bg-white/5">
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pb-8 pt-14 text-center sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/25 bg-[#7c3aed]/10 px-3 py-1 text-xs font-medium text-[#c4b5fd]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee]" /> Defensive OSINT decision-support
        </span>
        <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Detect fake news &amp; <span className="bg-gradient-to-r from-[#a78bfa] via-[#7c3aed] to-[#22d3ee] bg-clip-text text-transparent">foreign influence</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[#a5a8c2] sm:text-lg">
          TruthLens connects the infrastructure behind a site to the narratives being pushed -
          surfacing coordinated, conflict-driving influence with evidence and confidence levels.
          Indicators, never a verdict.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href={loginHref} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_28px_rgba(124,58,237,0.4)] transition hover:brightness-110">
            Enter the platform <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#features" className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-[#a5a8c2] transition hover:bg-white/5">
            What it does
          </a>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-[#7c3aed]/15 bg-[#0e1020]/70 p-5 backdrop-blur transition hover:border-[#7c3aed]/35">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#7c3aed]/20 bg-[#161828] text-[#a78bfa]">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-[#8b8ea8]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative mx-auto max-w-6xl px-6 pb-12 text-center text-xs text-[#6b6e8a]">
      </footer>
    </div>
  );
}
