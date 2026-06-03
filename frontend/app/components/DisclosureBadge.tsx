// Visible "AI / synthetic" badge — the UI mirror of the pixel-level label
// baked into every asset by the backend (C1). Always rendered for personas
// and their assets; it is never optional.
export function DisclosureBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-disclosure px-2 py-0.5 text-xs font-semibold text-white ${className}`}
      title="This content is AI-generated / synthetic and openly disclosed."
    >
      ● AI · SYNTHETIC
    </span>
  );
}
