import Link from "next/link";
import { FileSearch, Mailbox, ArrowRight } from "lucide-react";
import Nav from "@/components/Nav";
import Disclaimer from "@/components/Disclaimer";

export default function ToolsLanding() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Nav />

        <section className="mt-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Origin &amp; Attribution Tools
          </h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Attribute content to an origin — including hostile states or bot
            farms — through legitimate means: logs you own, email headers you
            received, and publicly observable infrastructure. TruthLens never
            fetches anyone else&apos;s private logs.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ToolCard
              href="/tools/logs"
              icon={<FileSearch className="h-6 w-6 text-blue-400" />}
              title="Log Analyzer"
              body="Upload or paste an access log you own. See where traffic came from, flag adversary-country and datacenter/bot origins, and reconstruct each visitor's content path."
            />
            <ToolCard
              href="/tools/email"
              icon={<Mailbox className="h-6 w-6 text-emerald-400" />}
              title="Email Header Tracer"
              body="Paste the raw source of an email you received. Reconstruct the delivery hops, infer the true origin IP and country, and get an SPF/DKIM/DMARC spoofing verdict."
            />
          </div>

          <Disclaimer className="mt-8" />
        </section>
      </div>
    </main>
  );
}

function ToolCard({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-surface-border bg-surface-card p-5 transition hover:border-blue-500/40"
    >
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <ArrowRight className="ml-auto h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-blue-400" />
      </div>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </Link>
  );
}
