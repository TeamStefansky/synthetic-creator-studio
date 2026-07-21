import { MapPin, Server, Globe, Mail, Network, AlertTriangle } from "lucide-react";
import type { Report, GeoEndpoint } from "@/lib/types";
import { flagEmoji, countryName } from "@/lib/countries";
import { isAdversaryCountry } from "@/lib/adversary";
import MiniMap, { MapMarker } from "./MiniMap";

function CountryValue({ code, masked }: { code?: string; masked?: boolean }) {
  if (masked) return <span className="text-sm text-yellow-300/90">CDN edge - masked</span>;
  if (!code) return <span className="text-sm text-gray-500">Unknown</span>;
  const adversary = isAdversaryCountry(code);
  return (
    <span className="text-sm font-medium text-gray-100">
      <span className="mr-1 text-base">{flagEmoji(code)}</span>
      {countryName(code) || code} <span className="text-gray-500">({code.toUpperCase()})</span>
      {adversary && <span className="ml-1 text-risk-high" title="In your adversary list">⚠</span>}
    </span>
  );
}

function Row({
  icon, label, code, extra, masked,
}: {
  icon: React.ReactNode; label: string; code?: string; extra?: string; masked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-bg-elev p-3">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        <span className="text-indigo-400">{icon}</span>
        {label}
      </div>
      <div className="text-right">
        <CountryValue code={code} masked={masked} />
        {extra && <div className="text-xs text-gray-500">{extra}</div>}
      </div>
    </div>
  );
}

function EndpointRows({ icon, label, items }: { icon: React.ReactNode; label: string; items: GeoEndpoint[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((e, idx) => (
        <Row
          key={`${label}-${idx}`}
          icon={icon}
          label={items.length > 1 ? `${label} ${idx + 1}` : label}
          code={e.country}
          extra={e.host}
        />
      ))}
    </>
  );
}

export default function GeoOriginCard({ report }: { report: Report }) {
  const host = report.infrastructure.hosting.value;
  const dom = report.infrastructure.domain.value;
  const geo = report.geography;

  const serverExtra =
    host?.cdnMasksOrigin
      ? host?.cdn
      : [[host?.city, host?.region].filter(Boolean).join(", "), host?.asnOrg].filter(Boolean).join(" · ") || undefined;

  // Build map markers from every located endpoint.
  const markers: MapMarker[] = [];
  if (geo?.server?.country) markers.push({ code: geo.server.country, title: "Server" });
  if (geo?.registrantCountry) markers.push({ code: geo.registrantCountry, title: "Registrant" });
  for (const m of geo?.mail || []) if (m.country) markers.push({ code: m.country, title: "Mail (MX)" });
  for (const d of geo?.dns || []) if (d.country) markers.push({ code: d.country, title: "DNS (NS)" });
  // Fallbacks if geography wasn't built.
  if (!geo) {
    if (!host?.cdnMasksOrigin && host?.country) markers.push({ code: host.country, title: "Server" });
    if (dom?.registrantCountry) markers.push({ code: dom.registrantCountry, title: "Registrant" });
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-5 w-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Geographic Origin</h2>
      </div>

      {markers.length > 0 && (
        <div className="mb-4">
          <MiniMap markers={markers} />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Row
          icon={<Server className="h-4 w-4" />}
          label="Server / hosting"
          code={geo?.server?.country ?? (host?.cdnMasksOrigin ? undefined : host?.country)}
          masked={geo?.server?.masked ?? host?.cdnMasksOrigin}
          extra={serverExtra}
        />
        <Row
          icon={<MapPin className="h-4 w-4" />}
          label="Domain registrant"
          code={geo?.registrantCountry ?? dom?.registrantCountry}
          extra={dom?.registrar}
        />
        <EndpointRows icon={<Mail className="h-4 w-4" />} label="Mail (MX)" items={geo?.mail || []} />
        <EndpointRows icon={<Network className="h-4 w-4" />} label="DNS (NS)" items={geo?.dns || []} />
      </div>

      {(geo?.server?.masked ?? host?.cdnMasksOrigin) && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-yellow-300/80">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A CDN ({geo?.server?.cdn ?? host?.cdn}) sits in front of this site, so the
          server location reflects the CDN edge, not the operator&rsquo;s true country.
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500">
        Geolocation is approximate; VPNs/Tor and CDNs can mask the true origin.
      </p>
    </div>
  );
}
