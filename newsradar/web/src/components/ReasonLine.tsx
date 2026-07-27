/** The API's `reason` line, muted secondary text (e.g. "Ukraine energy · 9 sources · 2h ago"). */
export function ReasonLine({ reason }: { reason: string }) {
  if (!reason) return null;
  return <p className="text-xs uppercase tracking-wide text-ink-faint">{reason}</p>;
}
