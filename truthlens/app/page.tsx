import { Network, ListChecks, ServerCog } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import Disclaimer from "@/components/Disclaimer";
import Nav from "@/components/Nav";

export default function LandingPage() {
  return (
    <main className="hero-gradient min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 sm:px-6 sm:py-16">
        <Nav />

        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Expose the infrastructure behind any website
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
            Paste a URL. TruthLens reveals who is behind the site — domain,
            hosting, mail, certificates, connected domains — and computes a
            transparent, evidence-based credibility risk rating.
          </p>

          <div className="mt-8 w-full max-w-2xl">
            <UrlInput />
          </div>

          <div className="mt-6 w-full max-w-2xl">
            <Disclaimer />
          </div>

          {/* Feature highlights */}
          <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
            <Feature
              icon={<ServerCog className="h-5 w-5 text-blue-400" />}
              title="Infrastructure exposure"
              body="WHOIS, DNS, hosting, SSL, tech stack and archive history — verifiable facts."
            />
            <Feature
              icon={<Network className="h-5 w-5 text-emerald-400" />}
              title="Operator network"
              body="Find sibling sites that share an IP, analytics/ad ID or certificate."
            />
            <Feature
              icon={<ListChecks className="h-5 w-5 text-amber-400" />}
              title="Transparent scoring"
              body="Every signal that moved the score is itemized with its weight."
            />
          </div>
        </section>

        <footer className="pt-8 text-center text-xs text-slate-600">
          TruthLens · indicators, not accusations · uses free public OSINT
          endpoints
        </footer>
      </div>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card/50 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-slate-200">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </div>
  );
}
