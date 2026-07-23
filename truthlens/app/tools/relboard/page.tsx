import { Network } from "lucide-react";
import RelBoard from "@/components/RelBoard";
import Disclaimer from "@/components/Disclaimer";

export const metadata = {
  title: "Relationship Board - org-level link analysis | TruthLens",
  description:
    "Map a company to its related organizations and disclosed public roles from public sources - a provenance-cited investigation board. Decision-support, not a verdict.",
};

export default function RelBoardPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Relationship <span className="gradient-text">Board</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Enter a company and get an interactive link-analysis board of its related organizations
          (parent, subsidiaries, partners, funders) and disclosed public roles - each node cited to a
          public source, with a confidence badge, a Hebrew/English toggle, and exports for i2 /
          Maltego / Gephi. Organizations and disclosed roles only - never personal profiles.
        </p>
      </div>

      <RelBoard />

      <p className="text-xs text-ink-secondary">
        For legitimate business research (due diligence, competitive intelligence). Content is
        AI-assembled from public sources, may be inaccurate or outdated, and must be independently
        verified before use. It surfaces organizations and disclosed public roles only - no home
        addresses, personal contact details, family, or other private personal data.
      </p>

      <Disclaimer variant="inline" />
    </div>
  );
}
