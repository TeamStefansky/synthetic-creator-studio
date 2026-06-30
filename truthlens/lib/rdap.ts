// WHOIS/RDAP lookup via rdap.org.

import { getJson } from "./http";
import type { DomainInfo } from "./types";

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: any[];
  publicIds?: any[];
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  status?: string[];
  secureDNS?: any;
}

function vcardField(entity: RdapEntity | undefined, field: string): string | undefined {
  const arr = entity?.vcardArray?.[1];
  if (!Array.isArray(arr)) return undefined;
  const row = arr.find((r: any[]) => r[0] === field);
  if (!row) return undefined;
  const val = row[3];
  return typeof val === "string" ? val : Array.isArray(val) ? val.filter(Boolean).join(", ") : undefined;
}

export async function lookupRdap(domain: string): Promise<DomainInfo> {
  const data = await getJson<RdapResponse>(
    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
    { headers: { Accept: "application/rdap+json" } },
  );

  if (!data) {
    return { privacyProtected: false };
  }

  const events = data.events || [];
  const createdAt = events.find((e) => e.eventAction === "registration")?.eventDate;
  const expiresAt = events.find((e) => e.eventAction === "expiration")?.eventDate;
  const updatedAt = events.find((e) => e.eventAction === "last changed")?.eventDate;

  const registrarEntity = data.entities?.find((e) => e.roles?.includes("registrar"));
  const registrantEntity = data.entities?.find((e) => e.roles?.includes("registrant"));

  const registrar =
    vcardField(registrarEntity, "fn") ||
    registrarEntity?.publicIds?.[0]?.identifier;

  const registrantOrg = vcardField(registrantEntity, "org") || vcardField(registrantEntity, "fn");
  const registrantAddr = vcardField(registrantEntity, "adr");
  const registrantCountry = registrantAddr?.split(",").pop()?.trim();

  // Heuristic privacy detection: redacted markers or known privacy proxies.
  const blob = JSON.stringify(data).toLowerCase();
  const privacyProtected =
    /redacted|privacy|whois ?guard|data protected|withheld|gdpr|domains by proxy/.test(
      blob,
    ) || (!registrantOrg && !registrantAddr);

  let ageDays: number | undefined;
  if (createdAt) {
    const ms = Date.now() - new Date(createdAt).getTime();
    if (!Number.isNaN(ms)) ageDays = Math.floor(ms / 86400000);
  }

  return {
    registrar,
    createdAt,
    expiresAt,
    updatedAt,
    registrantOrg: registrantOrg && !/redacted|privacy/i.test(registrantOrg) ? registrantOrg : undefined,
    registrantCountry: registrantCountry && registrantCountry.length <= 3 ? registrantCountry.toUpperCase() : registrantCountry,
    privacyProtected,
    ageDays,
    status: data.status,
  };
}
