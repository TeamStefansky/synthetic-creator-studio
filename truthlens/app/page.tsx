import Link from "next/link";
import { Eye, Network, ScrollText, Mail } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import Disclaimer from "@/components/Disclaimer";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="py-10 text-center sm:py-16">
        <div className="mb-4 flex justify-center">
          <span className="rounded-2xl bg-indigo-500/15 p-3">
            <Eye className="h-8 w-8 text-indigo-400" />
          </span>
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">TruthLens</h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-400">
          Detect likely fake-news websites and expose the infrastructure behind
          them. Paste a URL to get an itemized credibility-risk report and an
          operator-network graph.
        </p>

        <div className="mx-auto mt-8 max-w-xl">
          <UrlInput />
        </div>

        <div className="mx-auto mt-6 max-w-xl">
          <Disclaimer variant="inline" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Feature icon={<Network className="h-5 w-5" />} title="Operator graph" desc="Link a site to sibling domains via shared IP, GA/AdSense IDs, and SSL SAN." />
        <Link href="/tools/logs" className="block">
          <Feature icon={<ScrollText className="h-5 w-5" />} title="Log Analyzer" desc="Analyze logs you own: flag bots, datacenter ASNs, and adversary origins." />
        </Link>
        <Link href="/tools/email" className="block">
          <Feature icon={<Mail className="h-5 w-5" />} title="Email Tracer" desc="Trace an email's true origin from its Received: headers + spoofing verdict." />
        </Link>
      </section>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card h-full transition hover:border-indigo-400/40">
      <div className="mb-2 text-indigo-400">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-gray-400">{desc}</p>
    </div>
  );
}
