// Shared operator-reputation card: documented, cited, ORGANIZATION-level facts
// about the hosting operator(s) behind a site (Site Report / Link Board) or behind
// a narrative's amplifiers (Brand Watch, via the infra<->narrative bridge). Every
// flag carries confidence + an innocent alternative + a citation; a co-hosted match
// is context, not guilt; disclosed officers are cited public record, never a verdict.

import { Server, ArrowUpRight } from "lucide-react";
import type { OperatorReputation } from "@/lib/operator-reputation";

const TONE: Record<string, string> = {
  High: "border-risk-high/40 text-risk-high",
  Medium: "border-risk-unknown/40 text-risk-unknown",
  Low: "border-white/15 text-ink-secondary",
};

export default function OperatorReputationCard({
  rep, title = "Hosting operator reputation", intro,
}: {
  rep: OperatorReputation;
  title?: string;
  intro?: string;
}) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <Server className="h-5 w-5 text-brand-soft" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {intro && <p className="mb-2 text-sm text-ink-secondary">{intro}</p>}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
        {rep.asnOrg && <span className="rounded-full border border-white/15 px-2 py-0.5">{rep.asnOrgIsFrontend ? "frontend (CDN)" : "operator"}: <span className="text-ink">{rep.asnOrg}</span></span>}
        {rep.operators.map((o) => <span key={o} className="rounded-full border border-white/15 px-2 py-0.5">{o}</span>)}
        <span className="rounded-full border border-white/15 px-2 py-0.5">{rep.coHostedCount} co-hosted domain(s)</span>
        <span className={`rounded-full border px-2 py-0.5 ${rep.sanctions.connected ? "border-white/15" : "border-yellow-500/30 bg-yellow-500/5 text-yellow-200/80"}`} title={rep.sanctions.reason || ""}>
          sanctions: {rep.sanctions.connected ? `${rep.sanctions.hits} hit(s)` : "not connected"}
        </span>
      </div>

      {rep.flags.length === 0 ? (
        <p className="text-sm text-ink-secondary">{rep.note}</p>
      ) : (
        <ul className="space-y-2">
          {rep.flags.map((f, i) => (
            <li key={i} className={`rounded-lg border ${TONE[f.confidence]} bg-white/[0.02] p-2.5`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] uppercase tracking-wide">{f.kind.replace(/_/g, " ")}</span>
                <span className="text-ink">{f.detail}</span>
                <span className="text-[11px] text-ink-muted">· {f.onOwnInfra ? "operator's own infra" : "co-hosted"} · {f.confidence}</span>
                {f.citation && <a href={f.citation} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">source <ArrowUpRight className="h-3 w-3" /></a>}
              </div>
              <div className="mt-1 text-xs text-ink-secondary">Could also be: {f.alternative}</div>
              <div className="mt-0.5 text-[11px] text-ink-muted">re: {f.subject}</div>
            </li>
          ))}
        </ul>
      )}
      {rep.coHostedSample.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-2">
          <div className="label-muted mb-1">Also on this infrastructure (sample)</div>
          <div className="flex flex-wrap gap-1.5">
            {rep.coHostedSample.map((d) => <span key={d} className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-ink-secondary">{d}</span>)}
          </div>
        </div>
      )}
      {rep.publicOfficers && (rep.publicOfficers.officers.length > 0 || rep.publicOfficers.connected) && (
        <div className="mt-3 border-t border-white/5 pt-2">
          <div className="label-muted mb-1">Officers on public record (disclosed, cited)</div>
          {rep.publicOfficers.officers.length === 0 ? (
            <p className="text-xs text-ink-secondary">{rep.publicOfficers.reason || rep.publicOfficers.note}</p>
          ) : (
            <ul className="space-y-0.5">
              {rep.publicOfficers.officers.map((o, i) => (
                <li key={i} className="text-xs text-ink-secondary">
                  <span className="text-ink">{o.name}</span>{o.role ? ` · ${o.role}` : ""}{o.jurisdiction ? ` · ${o.jurisdiction}` : ""}
                  {o.sourceUrl && <> · <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-soft hover:underline">register</a></>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-ink-muted">{rep.publicOfficers.note}</p>
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-secondary">Organization-level, cited. Shared/CDN hosting places unrelated sites together - co-hosting is context, not evidence about this site. Named officers are official public-record disclosure, cited - never inferred, never a verdict.</p>
    </section>
  );
}
