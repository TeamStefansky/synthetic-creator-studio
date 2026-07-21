import Link from "next/link";
import { Eye, Network, ScrollText, Mail, Telescope, Globe, ArrowRight, ShieldQuestion } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import Disclaimer from "@/components/Disclaimer";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="relative animate-fade-up py-12 text-center sm:py-20">
        {/* faint grid + glow backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint [background-size:40px_40px] [mask-image:radial-gradient(40rem_24rem_at_50%_20%,black,transparent)]"
        />
        <div className="mb-5 flex justify-center">
          <span className="grid h-16 w-16 animate-float place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow">
            <Eye className="h-8 w-8 text-white" />
          </span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="gradient-text">TruthLens</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-gray-400">
          Not sure if a website is trustworthy? Paste its address below. TruthLens
          checks the infrastructure behind it and gives you a plain
          credibility-risk score with the evidence - not a verdict.
        </p>

        <div className="mx-auto mt-9 max-w-xl">
          <UrlInput />
        </div>

        {/* How to read the score - the band legend that otherwise only lived on /about */}
        <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-white/[0.08] p-4 text-left shadow-soft">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">How to read the score</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-risk-legit" /><span className="text-gray-400"><span className="font-semibold text-risk-legit">0–35</span> Likely legitimate</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-risk-unknown" /><span className="text-gray-400"><span className="font-semibold text-risk-unknown">36–65</span> Unknown</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-risk-high" /><span className="text-gray-400"><span className="font-semibold text-risk-high">66–100</span> High risk</span></div>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-xl">
          <Disclaimer variant="inline" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">What you get in the report</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feature icon={<Network className="h-5 w-5" />} title="Related sites" desc="Finds other sites run by the same operator - via shared servers, ad/analytics IDs, and certificates." />
          <Feature icon={<Globe className="h-5 w-5" />} title="Where it’s based" desc="The countries of its server, owner, mail, and DNS - shown on a mini map." />
          <Feature icon={<Telescope className="h-5 w-5" />} title="Who’s behind it" desc="Owners, affiliations, and funding where public - always with sources." />
          <Feature icon={<Eye className="h-5 w-5" />} title="True origin" desc="Attempts to reveal the real server hidden behind Cloudflare and other CDNs." />
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">More free tools</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/tools/post"><Feature icon={<ShieldQuestion className="h-5 w-5" />} title="Post Check" desc="Is a post or claim true? Paste it - we verify it against sources." linked /></Link>
          <Link href="/tools/logs"><Feature icon={<ScrollText className="h-5 w-5" />} title="Log Analyzer" desc="Check your own site’s traffic logs for bots and coordinated activity." linked /></Link>
          <Link href="/tools/email"><Feature icon={<Mail className="h-5 w-5" />} title="Email Tracer" desc="Paste an email’s headers to trace its origin and spot spoofing." linked /></Link>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon, title, desc, linked,
}: {
  icon: React.ReactNode; title: string; desc: string; linked?: boolean;
}) {
  return (
    <div className="card group h-full transition duration-200 hover:-translate-y-0.5 hover:border-indigo-400/30 hover:shadow-glow">
      <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-brand-soft ring-hairline">
        {icon}
      </div>
      <h3 className="flex items-center gap-1 font-semibold">
        {title}
        {linked && <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-60" />}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-gray-400">{desc}</p>
    </div>
  );
}
