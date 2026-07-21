import { ShieldAlert } from "lucide-react";

/** Persistent framing: indicators, not a verdict. */
export default function Disclaimer({ variant = "footer" }: { variant?: "footer" | "inline" }) {
  if (variant === "inline") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-200/90">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Decision-support tool - <strong>not a verdict</strong>. We surface
          verifiable infrastructure facts and compute a risk score from
          observable signals. &ldquo;Unknown&rdquo; is a valid, common result.
        </span>
      </div>
    );
  }
  return (
    <footer className="mt-12 border-t border-white/10 py-6 text-center text-xs text-ink-secondary">
      Decision-support tool - not a verdict. Indicators only. Attribution is
      probabilistic; geolocation is approximate and CDNs/VPNs/Tor mask true
      origin. Analyze only logs and emails you are authorized to inspect.
    </footer>
  );
}
