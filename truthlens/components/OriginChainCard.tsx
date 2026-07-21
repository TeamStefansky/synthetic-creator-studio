import { Route, ShieldQuestion, Server, Cloud, ArrowRight, AlertTriangle } from "lucide-react";
import type { OriginTrace } from "@/lib/types";
import { flagEmoji, countryName } from "@/lib/countries";

function Hop({
  icon, title, ip, country, sub, accent,
}: {
  icon: React.ReactNode; title: string; ip?: string; country?: string; sub?: string; accent?: string;
}) {
  return (
    <div className={`flex-1 rounded-lg border p-3 ${accent || "border-white/10 bg-bg-elev"}`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-secondary">{icon}{title}</div>
      <div className="mt-1 font-mono text-sm text-ink">{ip || " - "}</div>
      {country && (
        <div className="text-xs text-ink-secondary">
          {flagEmoji(country)} {countryName(country) || country}
        </div>
      )}
      {sub && <div className="text-xs text-ink-secondary">{sub}</div>}
    </div>
  );
}

export default function OriginChainCard({ trace }: { trace: OriginTrace }) {
  const hasCdn = !!trace.cdn;
  const origin = trace.likelyOrigin;

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-5 w-5 text-brand-soft" />
        <h2 className="text-lg font-semibold">Origin Chain {hasCdn ? `(behind ${trace.cdn})` : ""}</h2>
      </div>

      {/* Visual chain: visitor → CDN edge → true origin */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Hop icon={<ShieldQuestion className="mr-1 h-3.5 w-3.5" />} title="Visitor" ip="you" />
        <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-ink-muted sm:block" />
        {hasCdn && (
          <>
            <Hop
              icon={<Cloud className="mr-1 h-3.5 w-3.5" />}
              title="CDN edge"
              ip={trace.edgeIp}
              country={trace.edgeCountry}
              sub={trace.cdn}
              accent="border-yellow-500/30 bg-yellow-500/5"
            />
            <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-ink-muted sm:block" />
          </>
        )}
        <Hop
          icon={<Server className="mr-1 h-3.5 w-3.5" />}
          title={origin ? "Likely true origin" : hasCdn ? "True origin (hidden)" : "Origin server"}
          ip={origin?.ip || (hasCdn ? "unknown" : trace.edgeIp)}
          country={origin?.country || (hasCdn ? undefined : trace.edgeCountry)}
          sub={origin?.asnOrg}
          accent={origin ? "border-risk-legit/30 bg-risk-legit/5" : undefined}
        />
      </div>

      <p className="mt-3 text-sm text-ink">{trace.note}</p>

      {/* All discovered candidate IPs */}
      {trace.candidates.length > 0 && (
        <div className="mt-4">
          <div className="label-muted mb-2">Discovered infrastructure IPs (possible origins)</div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-secondary">
                <tr className="border-b border-white/10">
                  <th className="py-1.5 pr-3">IP</th><th className="pr-3">Country</th>
                  <th className="pr-3">Network (ASN)</th><th>Found via</th>
                </tr>
              </thead>
              <tbody>
                {trace.candidates.map((c) => (
                  <tr key={c.ip} className="border-b border-white/5">
                    <td className="py-1.5 pr-3 font-mono text-xs">{c.ip}</td>
                    <td className="pr-3">{c.country ? `${flagEmoji(c.country)} ${c.country}` : " - "}{c.isAdversary && <span className="text-risk-high"> ⚠</span>}</td>
                    <td className="pr-3 max-w-[180px] truncate text-ink-secondary">{c.asnOrg || " - "}</td>
                    <td className="text-ink-secondary">{c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {trace.methods.length > 0 && (
        <p className="mt-3 text-xs text-ink-secondary">Methods: {trace.methods.join(" · ")}.</p>
      )}
      <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-secondary">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Origin discovery is probabilistic OSINT from public DNS - candidates, not proof. A well-configured CDN may leak nothing.
      </p>
    </div>
  );
}
