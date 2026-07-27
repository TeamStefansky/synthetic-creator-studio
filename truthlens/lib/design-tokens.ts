// Aurora Dark - JS token source for canvas/SVG data-viz (NetworkGraph, ScoreGauge,
// MiniMap) that can't use Tailwind classes. One source of truth: these mirror the
// CSS custom properties in app/globals.css and the Tailwind theme. No component
// should hardcode a hex - import from here. (Wiring lands in the conform phase.)

export const TOKENS = {
  bg: "#07080f",
  surface: "#0E1020",
  surface2: "#161828",
  sunken: "#0B0D1A",
  text: "#E8EAF2",
  textSecondary: "#A5A8C2",
  textMuted: "#8B8EA8",
  border: "#20223A",
  borderStrong: "#2D2F4A",
  primary: "#4755A5",
  warm: "#66CBE6",
  badge: "#F5D742",
  gradStart: "#4755A5",
  gradMid: "#5691C9",
  gradEnd: "#66CBE6",
  gradDeep: "#1B2350",
} as const;

/** The signature gradient stops (violet -> light-violet -> cyan). */
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
  "#4755A5", // primary indigo (logo)
  "#66CBE6", // cyan accent (logo)
  "#8CA0E8", // light indigo
  "#F472B6", // pink
  "#34D399", // green
  "#38BDF8", // sky
  "#F5A623", // amber
  "#F0454F", // rose
] as const;
