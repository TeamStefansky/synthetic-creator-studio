// Transparent risk scoring. Higher score = higher risk. Clamp 0-100.
// Every signal is pushed into evidence[] with its impact and a readable detail.

import { editDistance, brandPart } from "./normalizeUrl";
import { credibleDomains } from "./reputation";
import { isAdversaryCountry, adversaryCodes } from "./adversary";
import type {
  Infrastructure,
  Reputation,
  ContentAnalysis,
  RiskResult,
  EvidenceItem,
  RiskBand,
  Confidence,
} from "./types";

export interface ScoringInput {
  domain: string;
  infrastructure: Infrastructure;
  reputation: Reputation;
  content: ContentAnalysis;
  /** sibling domains discovered (SAN, reverse-IP, shared ids) for fake-match. */
  siblingDomains: string[];
}

function bandOf(score: number): RiskBand {
  if (score <= 35) return "LIKELY_LEGITIMATE";
  if (score <= 65) return "UNKNOWN";
  return "HIGH_RISK";
}

/** Closest credible outlet by edit distance on the brand label. */
function lookalikeOf(domain: string): { target: string; distance: number } | null {
  const brand = brandPart(domain);
  let best: { target: string; distance: number } | null = null;
  for (const c of credibleDomains()) {
    const d = editDistance(brand, brandPart(c));
    if (best === null || d < best.distance) best = { target: c, distance: d };
  }
  // ignore exact matches (that's a credible match, not a lookalike)
  if (best && best.distance === 0) return null;
  return best;
}

export function scoreReport(input: ScoringInput): RiskResult {
  const { domain, infrastructure, reputation, content } = input;
  const evidence: EvidenceItem[] = [];
  let score = 40; // baseline

  const add = (label: string, impact: number, detail: string) => {
    score += impact;
    evidence.push({ label, impact, detail });
  };

  const dom = infrastructure.domain.value;
  const host = infrastructure.hosting.value;
  const mail = infrastructure.mail.value;
  const ssl = infrastructure.ssl.value;
  const tech = infrastructure.tech.value;

  // ---- Reputation (strongest) ----
  if (reputation.matchedCredible) {
    add("Known credible outlet", -40, `Domain matches the credible seed list (${reputation.matchedCredibleDomain}).`);
  }
  const positiveFc = reputation.factChecks.some((f) =>
    /true|correct|accurate|legitimate|mostly true/i.test(f.rating),
  );
  if (positiveFc && !reputation.matchedCredible) {
    add("Positive fact-check rating", -40, "A known fact-checker rated related claims positively/neutrally.");
  }
  if (reputation.matchedFake) {
    add("Shares infrastructure with a known-fake domain", +20, `Linked (directly or via shared IP/ad-id/SAN) to flagged domain ${reputation.matchedFakeDomain}.`);
  }

  // ---- Domain age & WHOIS ----
  if (dom?.ageDays != null) {
    const days = dom.ageDays;
    if (days < 90) add("Very new domain", +20, `Registered ${days} days ago (<3 months).`);
    else if (days < 180) add("New domain", +12, `Registered ${days} days ago (3-6 months).`);
    else if (days < 365) add("Recently registered", +6, `Registered ${days} days ago (6-12 months).`);
    else if (days > 5 * 365) add("Long-established domain", -15, `Registered ${Math.floor(days / 365)}+ years ago.`);
    else if (days > 2 * 365) add("Established domain", -8, `Registered ${Math.floor(days / 365)}+ years ago.`);
  }
  if (dom?.privacyProtected) {
    add("WHOIS privacy / redacted", +8, "Registrant identity is hidden behind privacy protection.");
  } else if (dom?.registrantOrg && dom.registrar) {
    add("Transparent registrant", -6, `Registrant org "${dom.registrantOrg}" via ${dom.registrar}.`);
  }

  // ---- Hosting / ASN ----
  if (host?.cdnMasksOrigin) {
    evidence.push({ label: "Behind a CDN", impact: 0, detail: `${host.cdn} edge detected — true origin server is masked; geolocation reflects the CDN, not the operator.` });
  } else if (host?.hostingType === "datacenter") {
    // Datacenter hosting alone is normal for sites; only a mild signal here.
    add("Datacenter / hosting ASN", +8, `Served from ${host.asnOrg || "a hosting/datacenter ASN"} (offshore/bulletproof hosts raise risk).`);
  }

  // ---- Adversary-origin flagging (addendum #3) ----
  if (adversaryCodes().length > 0) {
    const hostCountry = host?.cdnMasksOrigin ? undefined : host?.country;
    if (isAdversaryCountry(hostCountry)) {
      add("Server in adversary country", +8, `Hosting geolocated to ${hostCountry}, in your adversary policy list.`);
    }
    if (isAdversaryCountry(dom?.registrantCountry)) {
      add("Registrant in adversary country", +8, `WHOIS registrant country ${dom?.registrantCountry} is in your adversary policy list.`);
    }
  }

  // ---- Impersonation / typosquatting ----
  if (!reputation.matchedCredible) {
    const look = lookalikeOf(domain);
    if (look && look.distance > 0 && look.distance <= 2) {
      add("Possible impersonation / typosquatting", +25, `Domain closely resembles "${look.target}" (edit distance ${look.distance}).`);
    }
  }

  // ---- Transparency pages ----
  if (tech) {
    if (!tech.hasAbout && !tech.hasContact) {
      add("No about & no contact page", +10, "Neither an about nor a contact page was detected.");
    }
    if (!tech.hasAuthor) {
      add("No named author bylines", +8, "No author/byline markup detected on the page.");
    }
    if (tech.hasAbout && tech.hasContact && tech.hasAuthor && tech.hasCorrections) {
      add("Strong transparency signals", -15, "About + contact + named authors + corrections policy all present.");
    }
  }

  // ---- HTTPS / cert ----
  const httpsValid = !!ssl && ssl.certCount > 0;
  if (!httpsValid) {
    add("No valid HTTPS certificate", +10, "No current/valid certificate found via crt.sh.");
  }

  // ---- Mail auth (positive) ----
  if (httpsValid && mail?.spf && mail?.dmarc && mail?.dkim) {
    add("Full mail authentication", -6, "Valid HTTPS + SPF + DKIM + DMARC all present.");
  }

  // ---- Content signals ----
  if (content.available) {
    if (content.sensationalism > 70) add("High sensationalism", +15, `Sensationalism score ${content.sensationalism}/100.`);
    if (content.emotionalManipulation > 70) add("Emotional manipulation", +10, `Emotional-manipulation score ${content.emotionalManipulation}/100.`);
    if (content.sourcingQuality < 30) add("Weak sourcing", +10, `Sourcing-quality score ${content.sourcingQuality}/100.`);
    if (content.aiGeneratedLikelihood > 70) add("Likely AI-generated", +8, `AI-generation likelihood ${content.aiGeneratedLikelihood}/100.`);
  }

  // clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ---- Confidence ----
  const categories = [
    infrastructure.domain.status === "ok",
    infrastructure.hosting.status === "ok",
    infrastructure.mail.status === "ok",
    infrastructure.ssl.status === "ok",
    infrastructure.tech.status === "ok",
    infrastructure.archive.status === "ok",
    content.available,
  ];
  const ratio = categories.filter(Boolean).length / categories.length;
  const strongSignal =
    reputation.matchedCredible || reputation.matchedFake || reputation.factChecks.length > 0;

  let confidence: Confidence = "Low";
  if (strongSignal) confidence = "High";
  else if (ratio >= 0.7) confidence = "Medium";
  else if (ratio >= 0.4) confidence = "Medium";

  // sort evidence: biggest absolute impact first, neutral notes last
  evidence.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return { score, band: bandOf(score), confidence, evidence };
}
