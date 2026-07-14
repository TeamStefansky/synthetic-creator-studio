// WHOIS-style data via RDAP (rdap.org aggregates the right registry).
// Extracts registrar, key dates, registrant org/country and privacy status.

import { getJson } from "./httpClient";
import type { DomainInfo } from "./types";

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapVcardProp extends Array<unknown> {}
interface RdapEntity {
  roles?: string[];
  handle?: string;
  vcardArray?: [string, RdapVcardProp[]];
  entities?: RdapEntity[];
  remarks?: { title?: string; description?: string[] }[];
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: { ldhName?: string }[];
  secureDNS?: { delegationSigned?: boolean };
  notices?: { title?: string; description?: string[] }[];
}

function dateFor(events: RdapEvent[] | undefined, action: string): string | null {
  const e = events?.find((ev) => ev.eventAction === action);
  return e ? new Date(e.eventDate).toISOString() : null;
}

/** Pull a named field out of a jCard (vcardArray) entity. */
function vcardValue(entity: RdapEntity | undefined, field: string): string | null {
  const props = entity?.vcardArray?.[1];
  if (!props) return null;
  for (const p of props) {
    if (Array.isArray(p) && p[0] === field) {
      const val = p[3];
      if (typeof val === "string" && val.trim()) return val.trim();
      if (Array.isArray(val)) return val.filter(Boolean).join(", ");
    }
  }
  return null;
}

function findEntity(
  entities: RdapEntity[] | undefined,
  role: string
): RdapEntity | undefined {
  if (!entities) return undefined;
  for (const e of entities) {
    if (e.roles?.includes(role)) return e;
    const nested = findEntity(e.entities, role);
    if (nested) return nested;
  }
  return undefined;
}

function ageInDays(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export async function lookupRdap(domain: string): Promise<DomainInfo | null> {
  const json = await getJson<RdapResponse>(`https://rdap.org/domain/${domain}`);
  if (!json) return null;

  const registrarEntity = findEntity(json.entities, "registrar");
  const registrantEntity = findEntity(json.entities, "registrant");

  const registrar =
    vcardValue(registrarEntity, "fn") ?? registrarEntity?.handle ?? null;

  const registrantOrg =
    vcardValue(registrantEntity, "org") ??
    vcardValue(registrantEntity, "fn") ??
    null;

  // RDAP encodes country inside the "adr" vCard property; fall back to a scan
  // of remarks/notices for redaction hints.
  const registrantCountry = vcardValue(registrantEntity, "adr");

  // Detect privacy/redaction: registrant missing, or notices mention redaction.
  const noticesText = JSON.stringify(json.notices ?? json.entities ?? "")
    .toLowerCase();
  const privacyProtected =
    !registrantOrg ||
    noticesText.includes("redacted") ||
    noticesText.includes("privacy") ||
    noticesText.includes("data protected") ||
    noticesText.includes("gdpr");

  const createdAt = dateFor(json.events, "registration");

  return {
    registrar,
    createdAt,
    expiresAt: dateFor(json.events, "expiration"),
    updatedAt: dateFor(json.events, "last changed"),
    registrantOrg,
    registrantCountry,
    privacyProtected,
    ageDays: ageInDays(createdAt),
    nameservers: (json.nameservers ?? [])
      .map((n) => n.ldhName?.toLowerCase())
      .filter((x): x is string => Boolean(x)),
  };
}
