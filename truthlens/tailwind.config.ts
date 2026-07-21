import type { Config } from "tailwindcss";

// Aurora Dark tokens (Phase 1). Values mirror design/design-system-portable.md.
// Existing token NAMES are retuned in place (so un-conformed screens keep working
// and just adopt the new look); new role tokens (surface/primary/ink/line/grad)
// are added for the conform phase.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Risk band accents - kept as functional traffic-light roles, retuned to
        // Aurora status hues (Q1). Not part of the gradient budget.
        risk: {
          legit: "#22C55E",   // success green
          unknown: "#F5A623", // warning amber
          high: "#F0454F",    // danger red
        },
        // Canvas & surfaces - near-pure black.
        bg: {
          base: "#050506",
          card: "#131314",
          elev: "#1E1E20",
          sunken: "#0C0C0D",
        },
        // Brand / primary - electric purple (gradient anchor).
        brand: {
          DEFAULT: "#7F49E1",
          soft: "#A98BF0",
        },
        // --- Aurora role tokens (new; used as screens conform) ---
        surface: { DEFAULT: "#131314", "2": "#1E1E20", sunken: "#0C0C0D" },
        primary: { DEFAULT: "#7F49E1", hover: "#6E3BD0", active: "#5D32A7" },
        ink: { DEFAULT: "#EBEBEB", secondary: "#9A9A9F", muted: "#83838A" },
        line: { DEFAULT: "#232324", strong: "#37373A" },
        warm: "#E1804A",
        badge: "#F5D742",
        grad: { start: "#E1804A", mid: "#A25DA7", end: "#7F49E1", deep: "#3B1E73" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["Space Grotesk", "Clash Display", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Aurora display scale (additive; Tailwind defaults kept for the rest).
        hero: ["60px", { lineHeight: "1.05", fontWeight: "700" }],
        display: ["44px", { lineHeight: "1.1", fontWeight: "700" }],
        "h1-a": ["34px", { lineHeight: "1.15", fontWeight: "600" }],
        "h2-a": ["26px", { lineHeight: "1.2", fontWeight: "600" }],
      },
      borderRadius: {
        // Heavily rounded ramp. Remaps common usage: cards (2xl) -> 20, buttons/
        // inputs (xl) -> 14, lg -> 12, md/sm -> 10, pills (full) -> 999.
        sm: "10px",
        DEFAULT: "12px",
        md: "10px",
        lg: "12px",
        xl: "14px",
        "2xl": "20px",
        "3xl": "26px",
        full: "999px",
      },
      boxShadow: {
        soft: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 30px -12px rgba(0,0,0,0.6)",
        // Soft glow under the gradient - Aurora primary purple.
        glow: "0 0 0 1px rgba(127,73,225,0.25), 0 8px 40px -8px rgba(127,73,225,0.35)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
        // The signature gradient, as a Tailwind utility (bg-gradient-brand).
        "gradient-brand": "linear-gradient(120deg,#E1804A 0%,#A25DA7 50%,#7F49E1 100%)",
        "gradient-soft": "linear-gradient(120deg,rgba(127,73,225,.16),rgba(225,128,74,.16))",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        blink: {
          "0%, 90%, 100%": { transform: "scaleY(1)" },
          "94%": { transform: "scaleY(0.1)" },
          "97%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        float: "float 6s ease-in-out infinite",
        blink: "blink 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
