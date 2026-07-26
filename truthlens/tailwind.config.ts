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
        // Canvas & surfaces - deep violet-black.
        bg: {
          base: "#07080f",
          card: "#0e1020",
          elev: "#161828",
          sunken: "#0b0d1a",
        },
        // Brand / primary - electric violet (gradient anchor).
        brand: {
          DEFAULT: "#7C3AED",
          soft: "#A78BFA",
        },
        // Second accent - cyan.
        accent: { DEFAULT: "#22D3EE", soft: "#67E8F9" },
        // --- role tokens ---
        surface: { DEFAULT: "#0e1020", "2": "#161828", sunken: "#0b0d1a" },
        primary: { DEFAULT: "#7C3AED", hover: "#6D28D9", active: "#5B21B6" },
        ink: { DEFAULT: "#E8EAF2", secondary: "#A5A8C2", muted: "#8B8EA8" },
        line: { DEFAULT: "rgba(124,58,237,0.15)", strong: "rgba(124,58,237,0.34)" },
        warm: "#22D3EE",
        badge: "#F5D742",
        grad: { start: "#7C3AED", mid: "#8B5CF6", end: "#22D3EE", deep: "#1E1B4B" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["Bricolage Grotesque", "Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
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
        glow: "0 0 0 1px rgba(124,58,237,0.25), 0 8px 40px -8px rgba(124,58,237,0.35)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
        // The signature gradient, as a Tailwind utility (bg-gradient-brand).
        "gradient-brand": "linear-gradient(120deg,#7C3AED 0%,#8B5CF6 48%,#22D3EE 100%)",
        "gradient-soft": "linear-gradient(120deg,rgba(124,58,237,.16),rgba(34,211,238,.16))",
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
