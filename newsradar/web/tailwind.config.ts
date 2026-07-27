import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "Cambria", "serif"],
        sans: [
          "var(--font-sans)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        ink: {
          DEFAULT: "#141414",
          soft: "#3d3d3d",
          muted: "#6b6b6b",
          faint: "#9a9a9a",
        },
        paper: "#ffffff",
        wash: "#f6f5f2",
        line: "#e4e2dd",
        accent: {
          DEFAULT: "#a3231c",
          soft: "#c85a53",
        },
      },
      maxWidth: {
        prose: "72ch",
        reader: "1200px",
      },
      fontSize: {
        display: ["2.75rem", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        headline: ["1.9rem", { lineHeight: "1.14", letterSpacing: "-0.01em" }],
      },
    },
  },
  plugins: [],
};

export default config;
