import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0f172a", soft: "#334155", mute: "#64748b" },
        line: "#e2e8f0",
        canvas: "#f8fafc",
        brand: { DEFAULT: "#ea580c", dark: "#c2410c", tint: "#fff7ed" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.04)" },
    },
  },
  plugins: [],
};
export default config;
