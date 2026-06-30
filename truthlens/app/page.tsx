import Link from "next/link";
import { Eye, Network, ScrollText, Mail, Telescope, Globe, ArrowRight } from "lucide-react";
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
          Detect likely fake-news websites and expose the infrastructure behind
          them. Paste a URL for an itemized credibility-risk report, an
          operator-network graph, geographic origin, and deep OSINT.
        </p>

        <div className="mx-auto mt-9 max-w-xl">
          <UrlInput />
        </div>

        <div className="mx-auto mt-6 max-w-xl">
          <Disclaimer variant="inline" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Feature icon={<Network className="h-5 w-5" />} title="Operator graph" desc="Link a site to siblings via shared IP, GA/AdSense IDs, and SSL SAN." />
        <Feature icon={<Globe className="h-5 w-5" />} title="Geographic origin" desc="Server, registrant, mail & DNS countries on a mini world map." />
        <Feature icon={<Telescope className="h-5 w-5" />} title="Deep OSINT" desc="Who's behind the site — owners, affiliations, funding — with sources." />
        <Link href="/tools/logs"><Feature icon={<ScrollText className="h-5 w-5" />} title="Log Analyzer" desc="Analyze logs you own: flag bots, datacenter ASNs, adversary origins." linked /></Link>
        <Link href="/tools/email"><Feature icon={<Mail className="h-5 w-5" />} title="Email Tracer" desc="Trace an email's true origin from its headers + spoofing verdict." linked /></Link>
        <Feature icon={<Eye className="h-5 w-5" />} title="Origin chain" desc="Attempt to reveal the true server behind Cloudflare and other CDNs." />
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
