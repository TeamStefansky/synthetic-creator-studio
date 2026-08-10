// Processing baseline (layer 06 · P5) - the highest-volume false-positive guard.
// Between the event and our collection, something processed the artifact: CDN
// minification, image pipelines, platform transcoding, caches, archive rewriting,
// Unicode normalization, security gateways. SHARED PROCESSING MASQUERADES AS
// SHARED SIGNATURE - two unrelated sites behind the same optimizer produce
// identical re-encode artifacts. So before any signature feature contributes
// strength, compute the baseline for that entity's toolchain and subtract it. A
// feature indistinguishable from what the toolchain produces for EVERY user is a
// class characteristic of the toolchain, never an individual one of an operator.
// An unknown toolchain means the feature is treated as baseline-explained until
// shown otherwise. Baselines carry their provenance.

export const BASELINE_VERSION = "processing-baseline-v1";

export interface Toolchain {
  cdn?: string;
  cms?: string;
  imagePipeline?: string;
  platform?: string;
}

// Feature keys each toolchain imposes on everyone who uses it (with provenance).
export const BASELINES: Record<string, { features: string[]; provenance: string }> = {
  "cloudflare": { features: ["minified-html", "cf-ray-header", "brotli", "email-obfuscation", "rocket-loader-markup"], provenance: "Cloudflare edge transforms applied to all proxied sites" },
  "google-cloud-cdn": { features: ["minified-html", "gfe-header"], provenance: "Google edge defaults" },
  "wordpress": { features: ["wp-json-link", "wp-emoji-script", "generator-meta-wp", "wp-block-markup"], provenance: "WordPress core output for every install" },
  "cloudinary": { features: ["reencode-q-auto", "f-auto-webp", "cld-fetch-artifact"], provenance: "Cloudinary image pipeline defaults" },
  "imgix": { features: ["reencode-q-auto", "auto-format-artifact"], provenance: "imgix pipeline defaults" },
  "amp": { features: ["amp-boilerplate", "amp-normalized-markup"], provenance: "AMP transform normalizes markup identically for all" },
  "wayback": { features: ["archive-rewritten-urls", "wayback-toolbar-markup", "rewritten-timestamps"], provenance: "Internet Archive capture rewrites" },
};

/** The union of features the toolchain imposes on every user. */
export function baselineFeatures(tc: Toolchain): Set<string> {
  const out = new Set<string>();
  for (const id of [tc.cdn, tc.cms, tc.imagePipeline, tc.platform]) {
    if (!id) continue;
    for (const f of BASELINES[id.toLowerCase()]?.features || []) out.add(f);
  }
  return out;
}

/**
 * Whether a feature is explained by the toolchain baseline. An UNKNOWN toolchain
 * (no recognized components) => true: baseline-explained until shown otherwise.
 */
export function isBaselineExplained(feature: string, tc: Toolchain): boolean {
  const known = [tc.cdn, tc.cms, tc.imagePipeline, tc.platform].some((id) => id && BASELINES[id.toLowerCase()]);
  if (!known) return true; // unknown toolchain: cannot distinguish operator from processing
  return baselineFeatures(tc).has(feature);
}

/** Residual features - only variation the toolchain does NOT impose can carry weight. */
export function subtractBaseline(features: string[], tc: Toolchain): string[] {
  return features.filter((f) => !isBaselineExplained(f, tc));
}
