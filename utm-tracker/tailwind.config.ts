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
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
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
        "digit-in": {
          "0%": { opacity: "0", transform: "translateY(85%)", filter: "blur(2px)" },
          "60%": { opacity: "1", transform: "translateY(-8%)", filter: "blur(0)" },
          "100%": { transform: "translateY(0)" },
        },
        colon: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "digit-in": "digit-in 0.45s cubic-bezier(0.16,1,0.3,1) both",
        colon: "colon 1s steps(2, jump-none) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
