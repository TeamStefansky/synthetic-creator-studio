import SignalGrid from "@/components/SignalGrid";
import Disclaimer from "@/components/Disclaimer";

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
    <div className="space-y-4">
      <SignalGrid initialEntity={initial} />
      <p className="text-xs text-ink-secondary">
        SIGNAL plots real public mentions collected server-side (news, Bluesky, Reddit, Hacker News,
        RSS and the news APIs you have connected). Markers sit at the source country&rsquo;s centroid -
        the outlet&rsquo;s location, never a person&rsquo;s. Sentiment is classified server-side per collected
        mention (with a confidence); the gauge is computed from those labels, never invented, and shows
        how many mentions were actually labeled. Sources or layers without a key show as &ldquo;off&rdquo; /
        &ldquo;not connected&rdquo;.
      </p>
      <Disclaimer variant="inline" />
    </div>
  );
}
