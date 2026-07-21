// Aurora Dark - JS token source for canvas/SVG data-viz (NetworkGraph, ScoreGauge,
// MiniMap) that can't use Tailwind classes. One source of truth: these mirror the
// CSS custom properties in app/globals.css and the Tailwind theme. No component
// should hardcode a hex - import from here. (Wiring lands in the conform phase.)

export const TOKENS = {
  bg: "#050506",
  surface: "#131314",
  surface2: "#1E1E20",
  sunken: "#0C0C0D",
  text: "#EBEBEB",
  textSecondary: "#9A9A9F",
  textMuted: "#83838A",
  border: "#232324",
  borderStrong: "#37373A",
  primary: "#7F49E1",
  warm: "#E1804A",
  badge: "#F5D742",
  gradStart: "#E1804A",
  gradMid: "#A25DA7",
  gradEnd: "#7F49E1",
  gradDeep: "#3B1E73",
} as const;

/** The signature gradient stops (orange -> magenta -> purple). */
export const GRADIENT_STOPS = [TOKENS.gradStart, TOKENS.gradMid, TOKENS.gradEnd] as const;

/** Functional risk/status hues (traffic-light semantics; retuned to Aurora). */
export const STATUS = {
  legit: "#22C55E",   // success
  unknown: "#F5A623", // warning
  high: "#F0454F",    // danger
} as const;

/** Categorical palette for graph clusters - a data-viz exception to the scarce
 * gradient rule: distinct, accessible hues on the near-black canvas, anchored in
 * the Aurora family. */
export const CLUSTER_PALETTE = [
  "#7F49E1", // primary purple
  "#E1804A", // warm orange
  "#A25DA7", // magenta
  "#2DD4BF", // teal
  "#38BDF8", // sky
  "#F0454F", // rose
  "#A3E635", // lime
  "#F5A623", // amber
] as const;
