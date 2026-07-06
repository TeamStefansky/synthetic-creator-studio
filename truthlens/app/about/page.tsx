import Link from "next/link";
import {
  FileSearch, Gauge, Globe, Route, Network, Brain, MessageSquare, ShieldCheck,
  Radio, Image as ImageIcon, Telescope, Activity, ScrollText, Mail, Info, ArrowRight,
} from "lucide-react";
import Disclaimer from "@/components/Disclaimer";

export const metadata = { title: "TruthLens — how it works" };

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-indigo-400">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="text-sm leading-relaxed text-gray-400">{children}</div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="animate-fade-up py-6 text-center">
        <div className="mb-3 flex justify-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow">
            <Info className="h-6 w-6 text-white" />
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">How TruthLens works</h1>
        <p className="mx-auto mt-3 max-w-2xl text-gray-400">
          TruthLens exposes the infrastructure behind a website and computes a
          transparent credibility-risk rating from observable signals. It is a
          decision-support tool — it surfaces evidence and indicators, never a verdict.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">The report has two parts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Section icon={<FileSearch className="h-5 w-5" />} title="Infrastructure exposure">
            Who is behind a site: domain registration (WHOIS/RDAP), hosting IP/ASN,
            mail, SSL certificates and their sibling domains, tech stack, and
            archive history — all from free, public sources, server-side.
          </Section>
          <Section icon={<Gauge className="h-5 w-5" />} title="Credibility risk rating">
            A badge (Likely Legitimate / Unknown / High Risk), a 0–100 score, a
            confidence level, and an itemized list of every signal — with its
            weight — that produced the score.
          </Section>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Scoring methodology</h2>
        <div className="card space-y-3 text-sm text-gray-400">
          <p>Every site starts from a neutral baseline of <strong className="text-gray-200">40</strong>. Signals push the score up (more risk) or down (more legitimate); it&rsquo;s clamped to 0–100. Bands: <span className="text-risk-legit">0–35 Likely Legitimate</span> · <span className="text-risk-unknown">36–65 Unknown</span> · <span className="text-risk-high">66–100 High Risk</span>.</p>
          <p><strong className="text-gray-200">Risk-increasing:</strong> very new domain, hidden WHOIS, datacenter/offshore hosting, lookalike/typosquatting of a known outlet, no about/contact/author pages, no valid HTTPS, shared infrastructure with a known-fake domain, and content signals (sensationalism, emotional manipulation, weak sourcing, AI-generation likelihood).</p>
          <p><strong className="text-gray-200">Risk-decreasing:</strong> match to the researched credible-outlets allowlist, positive fact-check ratings, established domain age &amp; long web presence, high domain authority, complete transparency pages, and full mail authentication.</p>
          <p><strong className="text-gray-200">Safety cap:</strong> a recognized leading outlet (or a long-lived, high-authority site) is never rated High Risk. &ldquo;Unknown&rdquo; is a valid, common, honest result.</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Capabilities</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Section icon={<ShieldCheck className="h-5 w-5" />} title="Legitimacy & authority">
            Domain age, Wayback longevity, archive volume, optional Open PageRank,
            SEO completeness, and a ~450-outlet researched allowlist recognize
            established sites automatically.
          </Section>
          <Section icon={<Globe className="h-5 w-5" />} title="Geographic origin">
            Server, registrant, mail (MX) and DNS (NS) countries — with flags and a
            mini world map. CDNs are labeled &ldquo;true origin masked.&rdquo;
          </Section>
          <Section icon={<Route className="h-5 w-5" />} title="Origin chain">
            Attempts to reveal the real server behind a CDN via non-proxied
            subdomains, MX servers, and SPF — probabilistic candidates, not proof.
          </Section>
          <Section icon={<Network className="h-5 w-5" />} title="Operator network">
            Links a site to siblings via shared IP, GA/AdSense IDs, and SSL SAN.
            Every node is clickable (analyze / IP lookup / ID pivot).
          </Section>
          <Section icon={<Brain className="h-5 w-5" />} title="Narrative intelligence">
            Main narratives, propaganda techniques, manipulation tactics, intent,
            and target audience — plus an organic-vs-coordinated authenticity read.
          </Section>
          <Section icon={<MessageSquare className="h-5 w-5" />} title="Insights Q&A">
            Ask the finished report anything; answers are grounded only in its own
            data, citing the signals used.
          </Section>
          <Section icon={<Radio className="h-5 w-5" />} title="Social amplification">
            (Optional key) Finds who amplifies a site on X, estimates the share of
            inauthentic/bot accounts, and lists the top spreaders.
          </Section>
          <Section icon={<ImageIcon className="h-5 w-5" />} title="Deepfake / AI images">
            (Optional key) Checks the page&rsquo;s images for AI-generation and
            deepfakes via Sightengine or Hive.
          </Section>
          <Section icon={<Telescope className="h-5 w-5" />} title="Deep OSINT">
            (Optional key) Open-web research on who is behind a site — owners,
            affiliations, funding, controversies — with sources.
          </Section>
          <Section icon={<Activity className="h-5 w-5" />} title="Monitoring & alerts">
            Watch a list of domains; the daily job detects changes (band worsened,
            score jump, coordination up, narrative spike) and alerts a webhook.
          </Section>
          <Section icon={<ScrollText className="h-5 w-5" />} title="Log Analyzer">
            Analyze access logs you own: flag bots, datacenter ASNs, adversary
            origins, reused user-agents, and reconstruct each visitor&rsquo;s path.
          </Section>
          <Section icon={<Mail className="h-5 w-5" />} title="Email Tracer">
            Reconstruct an email&rsquo;s hop path, infer its true origin, and read
            SPF/DKIM/DMARC for a spoofing verdict.
          </Section>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Honest limitations</h2>
        <div className="card space-y-2 text-sm text-gray-400">
          <p>• We cannot automatically determine truth — we surface verifiable facts and compute a risk score from observable signals.</p>
          <p>• Geolocation is approximate; CDNs/VPNs/Tor mask true origin, and the tool says so rather than guessing.</p>
          <p>• Attribution and origin discovery are probabilistic — indicators with evidence, not proof.</p>
          <p>• The adversary-country list ships empty; you set your own policy. Reputation lists are seeds you can expand.</p>
          <p>• Some layers (content analysis, OSINT, social, deepfake, monitoring history) rely on optional API keys and degrade gracefully without them.</p>
        </div>
      </section>

      <div className="flex justify-center">
        <Link href="/" className="btn">
          Analyze a site <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <Disclaimer variant="inline" />
    </div>
  );
}
