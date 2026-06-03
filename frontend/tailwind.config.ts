import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        disclosure: "#0ea5e9", // the "AI / synthetic" accent
      },
    },
  },
  plugins: [],
};
export default config;
