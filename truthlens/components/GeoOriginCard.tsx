import { MapPin, Server, Globe, Mail, AlertTriangle } from "lucide-react";
import type { Report } from "@/lib/types";
import { flagEmoji, countryName } from "@/lib/countries";
import { isAdversaryCountry } from "@/lib/adversary";

function Row({
  icon,
  label,
  code,
  extra,
  masked,
}: {
  icon: React.ReactNode;
  label: string;
  code?: string;
  extra?: string;
  masked?: boolean;
}) {
  const name = countryName(code);
  const adversary = isAdversaryCountry(code);
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-bg-elev p-3">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        <span className="text-indigo-400">{icon}</span>
        {label}
      </div>
      <div className="text-right">
        {masked ? (
          <span className="text-sm text-yellow-300/90">CDN edge — true origin masked</span>
        ) : code ? (
          <span className="text-sm font-medium text-gray-100">
            <span className="mr-1 text-base">{flagEmoji(code)}</span>
            {name || code} <span className="text-gray-500">({code.toUpperCase()})</span>
            {adversary && <span className="ml-1 text-risk-high" title="In your adversary list">⚠</span>}
          </span>
        ) : (
          <span className="text-sm text-gray-500">Unknown</span>
        )}
        {extra && <div className="text-xs text-gray-500">{extra}</div>}
      </div>
    </div>
  );
}

export default function GeoOriginCard({ report }: { report: Report }) {
  const host = report.infrastructure.hosting.value;
  const dom = report.infrastructure.domain.value;

  const serverExtra = [host?.city, host?.region].filter(Boolean).join(", ") || undefined;

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-5 w-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Geographic Origin</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Row
          icon={<Server className="h-4 w-4" />}
          label="Server / hosting"
          code={host?.cdnMasksOrigin ? undefined : host?.country}
          masked={host?.cdnMasksOrigin}
          extra={host?.cdnMasksOrigin ? host?.cdn : [serverExtra, host?.asnOrg].filter(Boolean).join(" · ") || undefined}
        />
        <Row
          icon={<MapPin className="h-4 w-4" />}
          label="Domain registrant"
          code={dom?.registrantCountry}
          extra={dom?.registrar}
        />
      </div>
      {host?.cdnMasksOrigin && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-yellow-300/80">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A CDN ({host.cdn}) sits in front of this site, so the server location
          reflects the CDN edge, not the operator&rsquo;s true country.
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500">
        Geolocation is approximate; VPNs/Tor and CDNs can mask the true origin.
      </p>
    </div>
  );
}
