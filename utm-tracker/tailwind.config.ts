import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0a0c",
          raised: "#121216",
          card: "#16161b",
          hover: "#1d1d23",
        },
        line: "#26262e",
        ink: {
          DEFAULT: "#f4f4f5",
          muted: "#a1a1aa",
          faint: "#6b6b76",
        },
        accent: {
          DEFAULT: "#5290BD", // brand blue — buttons, focus, highlights
          soft: "#14222e",
        },
        clicks: "#5b9bff", // cool blue — clicks
        leads: "#3ecf8e", // green — leads / conversions
        danger: "#f87171",
      },
      fontFamily: {
        display: ["var(--font-display)", "var(--font-cyrillic)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "var(--font-cyrillic)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "var(--font-mono-cyrillic)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(82,144,189,0.3), 0 8px 30px -10px rgba(82,144,189,0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
