import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ecff",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
        ink: {
          900: "#0b1220",
          800: "#111a2b",
          700: "#1c2740",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)",
        card: "0 4px 24px -8px rgba(16,24,40,.18)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in .3s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
