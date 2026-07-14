// Transparent, weighted risk scoring.
// Higher score = higher risk. Baseline 40, clamped 0-100.
// Every applied signal is pushed into evidence[] with its impact and a
// human-readable detail so the UI can always show WHY, never just a verdict.

import type {
  Band,
  Confidence,
  ContentAnalysis,
  EvidenceItem,
  Infrastructure,
  Reputation,
  Risk,
} from "./types";
import type { LookalikeResult } from "./reputation";

interface ScoringInput {
  infra: Infrastructure;
  reputation: Reputation;
  content: ContentAnalysis;
  lookalike: LookalikeResult;
  sharesWithFake: { shared: boolean; via: string | null };
  // Attribution addendum: adversary-origin flag (already CDN-aware — the route
  // only sets this when the country is trustworthy, i.e. not masked by a CDN).
  adversary: { flagged: boolean; detail: string | null };
}

function bandFor(score: number): Band {
  if (score <= 35) return "LIKELY LEGITIMATE";
  if (score <= 65) return "UNKNOWN";
  return "HIGH RISK";
}

export function computeRisk(input: ScoringInput): Risk {
  const { infra, reputation, content, lookalike, sharesWithFake, adversary } =
    input;
  const evidence: EvidenceItem[] = [];
  let score = 40; // baseline

  const add = (label: string, impact: number, detail: string) => {
    score += impact;
    evidence.push({ label, impact, detail });
  };

  // Track how many independent signal CATEGORIES returned real data, for the
  // confidence rating.
  const categoriesAvailable = new Set<string>();

  // ---- Reputation (strongest signals) ------------------------------------
  let reputationDecisive = false;
  if (reputation.matchedCredible) {
    add(
      "Known credible outlet",
      -40,
      `Domain matches the seed list of recognized news organizations (${reputation.matchedCredibleDomain}).`
    );
    reputationDecisive = true;
    categoriesAvailable.add("reputation");
  }
  if (reputation.matchedFake) {
    add(
      "Listed as known disinformation/hoax source",
      +30,
      `Domain matches a documented hoax/disinfo seed list (${reputation.matchedFakeDomain}). Indicator, not a legal accusation.`
    );
    reputationDecisive = true;
    categoriesAvailable.add("reputation");
  }
  if (reputation.factChecks.length > 0) {
    categoriesAvailable.add("factcheck");
    const negative = reputation.factChecks.some((f) =>
      /false|fake|hoax|misleading|pants on fire|incorrect|debunk/i.test(
        f.rating ?? ""
      )
    );
    if (negative) {
      add(
        "Negative fact-check ratings found",
        +12,
        `${reputation.factChecks.length} fact-check item(s) reference this domain, some with negative ratings.`
      );
    } else {
      add(
        "Neutral/positive fact-check coverage",
        -8,
        `${reputation.factChecks.length} fact-check item(s) reference this domain without negative ratings.`
      );
      reputationDecisive = true;
    }
  }

  // ---- Lookalike / typosquatting -----------------------------------------
  if (lookalike.isLookalike && lookalike.target) {
    add(
      "Lookalike of a known outlet",
      +25,
      `Domain closely resembles "${lookalike.target}" (edit distance ${lookalike.distance}) — possible impersonation/typosquatting.`
    );
    categoriesAvailable.add("impersonation");
  }

  // ---- Domain age ---------------------------------------------------------
  const age = infra.domain.ageDays;
  if (age !== null) {
    categoriesAvailable.add("domain");
    if (age < 90) {
      add("Very new domain", +20, `Registered ${age} days ago (<3 months).`);
    } else if (age < 180) {
      add("New domain", +12, `Registered ${age} days ago (3-6 months).`);
    } else if (age < 365) {
      add("Recently created domain", +6, `Registered ${age} days ago (6-12 months).`);
    } else if (age > 5 * 365) {
      add("Long-established domain", -15, `Registered ${Math.floor(age / 365)} years ago (>5 years).`);
    } else if (age > 2 * 365) {
      add("Established domain", -8, `Registered ${Math.floor(age / 365)} years ago (2-5 years).`);
    }
  }

  // ---- WHOIS privacy ------------------------------------------------------
  if (infra.domain.privacyProtected) {
    add(
      "WHOIS ownership hidden",
      +8,
      "Registrant details are redacted/privacy-protected. Common and legal, but reduces transparency."
    );
  }

  // ---- Hosting / ASN ------------------------------------------------------
  if (infra.hosting.asn || infra.hosting.org) {
    categoriesAvailable.add("hosting");
    const org = (infra.hosting.org ?? "").toLowerCase();
    const highRisk = /bulletproof|offshore|flokinet|njal|ddos-guard|king servers/.test(
      org
    );
    if (highRisk) {
      add(
        "High-risk / bulletproof hosting",
        +8,
        `Hosted by "${infra.hosting.org}", an ASN associated with abuse-tolerant hosting.`
      );
    }
  }

  // ---- Shared infrastructure with a flagged site -------------------------
  if (sharesWithFake.shared) {
    add(
      "Shares infrastructure with a flagged site",
      +20,
      `Shares ${sharesWithFake.via} with a domain on the known-fake list — a hallmark of coordinated networks.`
    );
    categoriesAvailable.add("network");
  }

  // ---- Adversary-origin flag (operator-configured policy) ----------------
  if (adversary.flagged) {
    add(
      "Adversary-country origin",
      +12,
      adversary.detail ??
        "An observed origin country matches the operator-configured adversary list."
    );
    categoriesAvailable.add("origin");
  }

  // ---- Transparency affordances ------------------------------------------
  const t = infra.tech;
  categoriesAvailable.add("tech");
  if (!t.hasAbout && !t.hasContact) {
    add(
      "No about or contact page",
      +10,
      "Neither an about page nor a contact page was detected — low accountability."
    );
  }
  if (!t.hasAuthors) {
    add(
      "No named authors",
      +8,
      "No author bylines were detected on the page."
    );
  }
  const fullyTransparent =
    t.hasAbout && t.hasContact && t.hasAuthors && t.hasCorrections;
  if (fullyTransparent) {
    add(
      "Strong transparency signals",
      -15,
      "About + contact + named authors + corrections policy all detected."
    );
  }

  // ---- HTTPS / cert -------------------------------------------------------
  if (infra.ssl.validHttps) {
    categoriesAvailable.add("ssl");
  } else {
    add(
      "No valid HTTPS",
      +10,
      "The site did not present a valid HTTPS certificate on fetch."
    );
  }

  // ---- Mail auth (positive) ----------------------------------------------
  const m = infra.mail;
  if (infra.ssl.validHttps && m.hasSpf && m.hasDmarc) {
    add(
      "Mail authentication configured",
      -6,
      "Valid HTTPS plus SPF and DMARC records present — signs of an established operator."
    );
  }

  // ---- Reputable registrar + transparent registrant ----------------------
  const registrar = (infra.domain.registrar ?? "").toLowerCase();
  const reputableRegistrar =
    /godaddy|namecheap|google|cloudflare|gandi|name\.com|markmonitor|csc|tucows|ovh|porkbun/.test(
      registrar
    );
  if (!infra.domain.privacyProtected && infra.domain.registrantOrg && reputableRegistrar) {
    add(
      "Transparent registrant + reputable registrar",
      -6,
      `Registrant "${infra.domain.registrantOrg}" is disclosed via a mainstream registrar.`
    );
  }

  // ---- Content analysis (Anthropic) --------------------------------------
  if (content.available) {
    categoriesAvailable.add("content");
    if ((content.sensationalism ?? 0) > 70) {
      add("Sensational content", +15, `Sensationalism score ${content.sensationalism}/100.`);
    }
    if ((content.emotionalManipulation ?? 0) > 70) {
      add("Emotional manipulation", +10, `Emotional-manipulation score ${content.emotionalManipulation}/100.`);
    }
    if ((content.sourcingQuality ?? 100) < 30) {
      add("Poor sourcing", +10, `Sourcing-quality score ${content.sourcingQuality}/100.`);
    }
    if ((content.aiGeneratedLikelihood ?? 0) > 70) {
      add("Likely AI-generated", +8, `AI-generation likelihood ${content.aiGeneratedLikelihood}/100.`);
    }
  }

  // ---- Finalize -----------------------------------------------------------
  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandFor(score);

  // Confidence: based on how many categories returned data; a decisive
  // reputation/fact-check hit forces High.
  let confidence: Confidence;
  const n = categoriesAvailable.size;
  if (reputationDecisive || reputation.matchedFake) confidence = "High";
  else if (n >= 5) confidence = "High";
  else if (n >= 3) confidence = "Medium";
  else confidence = "Low";

  // Sort evidence by absolute impact, strongest first, for display.
  evidence.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return { score, band, confidence, evidence };
}
