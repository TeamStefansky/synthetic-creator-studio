import { Sparkles } from "lucide-react";
import clsx from "clsx";

// Visible "AI / synthetic" badge — the UI mirror of the pixel-level label
// baked into every asset by the backend (C1). Never optional.
export function DisclosureBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={clsx(
        "chip bg-brand-600 text-white shadow-soft",
        compact && "px-2 py-0.5 text-[10px]",
        className,
      )}
      title="This content is AI-generated / synthetic and openly disclosed."
    >
      <Sparkles className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      AI · SYNTHETIC
    </span>
  );
}
