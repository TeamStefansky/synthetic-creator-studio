import { Radio } from "lucide-react";
import SignalGrid from "@/components/SignalGrid";
import Disclaimer from "@/components/Disclaimer";
import FullBleed from "@/components/FullBleed";
import ViewTabs from "@/components/ViewTabs";

// SIGNAL - Brand Intelligence Grid. A full-console view of Brand Mentions: the
// same real, server-collected public mentions (GET /api/mentions) rendered as a
// live world grid + signal feed + honest analysis panels. No sentiment or trend
// is fabricated; unconnected sources are shown as "off" (CLAUDE.md rules 4, 7).

export const metadata = {
  title: "SIGNAL - Brand Intelligence Grid | TruthLens",
  description:
    "A live grid of where a brand or term appears across public sources - geolocated mentions, signal feed and honest analysis. Decision-support, not a verdict.",
};

export default function SignalPage({ searchParams }: { searchParams: { entity?: string } }) {
  const initial = (searchParams?.entity || "").trim();
  return (
    <div className="space-y-6">
      <ViewTabs set="signal" />
      <FullBleed />
      <div>
        <div className="flex items-center gap-2">
          <Radio className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">
            SIGNAL <span className="gradient-text">Grid</span>
          </h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Real, server-collected public mentions across every connected source, rendered as a live
          world grid with a signal feed and honest analysis panels. Switch views above for the flat
          list with prediction markets, or the early-warning escalation forecast.
        </p>
      </div>
      <SignalGrid initialEntity={initial} />
      <Disclaimer variant="inline" />
    </div>
  );
}
