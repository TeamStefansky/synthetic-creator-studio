# 02 — Server / infrastructure extension (as-built in this repo)

This layer is **already implemented** across the Site Report / Origin / Link Board stack (not a
placeholder). Layers 03–06 consume these infrastructure artifacts and their calibrated
discriminating power.

## What exists

- **Infrastructure fingerprint** (`lib/board/links.ts::collectFingerprint`) — per domain: primary
  IP + ASN/asnOrg, reverse-IP neighbours (with a CDN/mass-host flag), TLS SANs, DNS/NS, registrar,
  MX, embedded origins, analytics/tag IDs.
- **Origin exposure / de-CDN** (`lib/origin-exposure.ts`) — CDN edge vs likely true origin,
  discovered non-CDN IPs from public DNS (subdomains, MX, SPF, crt.sh, OTX, SecurityTrails,
  HackerTarget), each geo/ASN-enriched. Probabilistic OSINT from public DNS, labelled as candidates.
- **Geography** (`lib/types.ts::Geography`) — server / mail / dns endpoints with country + `asnOrg`,
  CDN-masking flag.
- **Calibrated discriminating power** (`lib/board/calibrate.ts`) — the IP / ASN / asnOrg / PTR /
  SSL-SAN entries with their tiers, CDN/mass-host informational down-weighting
  (`SHARED_IP_THRESHOLD`, `isMassHostOrg`, `ctx.cdn`).
- **Operator identity across searches** (`lib/clues/extract.ts`) — normalized `net_org` from
  `asnOrg` + nameserver registrable domains, mega-provider filtered, so a niche host (e.g. `1984`)
  links two searches while Cloudflare/Google never do.

## Invariants this layer already enforces (never weaken)

- Geolocation is approximate; a CDN edge is **never** the operator's true country — surfaced in UI.
- CDN / mass-host membership is **informational, never a link** (class characteristic).
- Origin discovery is **probabilistic**, labelled "candidates, not proof; a well-configured CDN may
  leak nothing."
- Nodes are **infrastructure, never people**.

## What layer 03+ / 06 add on top

Layer 06 reclassifies each infrastructure artifact explicitly as a **class** characteristic (CDN,
registrar, ASN, country, shared-host IP) or an **individual** one (a dedicated non-wildcard cert
SAN, a self-hosted analytics id, an idiosyncratic origin), and subtracts the **processing baseline**
(what the CDN/CMS/toolchain imposes on everyone) before any feature contributes strength. Layer 03
records each with its time tier and `BOARD_RUBRIC_VERSION` stamp in the evidence ledger.
