/** Persistent framing: indicators, not a verdict. Kept deliberately subtle - a
 * single quiet footer line - so it never dominates the page, but the frozen
 * "decision-support, not a verdict" framing is always present (CLAUDE.md). */
export default function Disclaimer({ variant: _variant }: { variant?: "footer" | "inline" }) {
  return (
    <p className="mt-8 border-t border-white/5 pt-3 text-center text-[11px] leading-relaxed text-ink-muted">
      Decision-support tool - not a verdict. Indicators with evidence; “Unknown” is a valid result.
    </p>
  );
}
