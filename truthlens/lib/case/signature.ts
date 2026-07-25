// Method vs. signature (layer 06 · P5). MO is what the operation NEEDS (hosting,
// registrar, CDN, platform) — learned, adaptive, cheap to change under pressure.
// Signature is what it does NOT need but repeats anyway (idiosyncratic phrasing,
// recurring error patterns, re-encode habits, publishing rhythm, transliteration
// choices, the same broken markup). Signature outweighs MO because MO changes
// under pressure and signature persists. BUT the processing-baseline gate runs
// FIRST: a signature feature indistinguishable from what the toolchain imposes on
// everyone is a class characteristic of the toolchain, not the operator, and is
// credited no strength.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import { subtractBaseline, type Toolchain } from "./baseline";

export const SIGNATURE_VERSION = "signature-v1";

export type FeatureType = "mo" | "signature";

// Feature name/kind hints for classification.
const SIGNATURE_HINTS = /(phrasing|error|reencode|re-encode|rhythm|translit|broken-markup|template|typo|idiosyn)/i;
const MO_HINTS = /(hosting|registrar|cdn|platform|nameserver|publishing|server)/i;

export function classifyFeature(name: string): FeatureType {
  if (SIGNATURE_HINTS.test(name)) return "signature";
  if (MO_HINTS.test(name)) return "mo";
  return "mo"; // default to MO — the burden is on individuation
}

export interface SigFeature { name: string; isSignature: boolean }

export interface SignatureScore {
  creditedSignature: string[];  // residual signature the toolchain does not impose
  baselineAbsorbed: string[];   // signature-looking features explained by the toolchain
  moFeatures: string[];
  strength: ConfidenceLevel;
  alternative: string;
}

// Staging detection through effort asymmetry: an operation displaying consistent
// sophistication EXCEPT at one conveniently discoverable point is either careless
// in a very specific place or arranged to be found.
export interface OpsecProfile {
  privacyProtection: boolean;
  infraSeparation: boolean;
  contentHygiene: boolean;
  metadataStripping: boolean;
  convenientlyExposed: number; // count of conveniently-discoverable lapses
}

export function effortAsymmetry(p: OpsecProfile): boolean {
  const sophistication = [p.privacyProtection, p.infraSeparation, p.contentHygiene, p.metadataStripping].filter(Boolean).length;
  return sophistication >= 3 && p.convenientlyExposed >= 1;
}

/**
 * Score a set of shared behavioural features between two entities, gated by the
 * processing baseline of their shared toolchain. Signature (residual) > MO.
 */
export function scoreSignature(features: SigFeature[], toolchain: Toolchain): SignatureScore {
  const sigNames = features.filter((f) => f.isSignature).map((f) => f.name);
  const moFeatures = features.filter((f) => !f.isSignature).map((f) => f.name);

  const creditedSignature = subtractBaseline(sigNames, toolchain);        // only residual variation carries weight
  const baselineAbsorbed = sigNames.filter((n) => !creditedSignature.includes(n));

  const strength: ConfidenceLevel = creditedSignature.length > 0 ? "High" : moFeatures.length > 0 ? "Low" : "Unknown";

  return {
    creditedSignature,
    baselineAbsorbed,
    moFeatures,
    strength,
    alternative: "Shared tooling and shared templates produce shared signatures innocently — a common CDN, image optimizer, CMS theme, or publishing tool explains identical artifacts without common operation; each signature type carries its own base rate.",
  };
}
