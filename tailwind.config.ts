import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f6f7ff",
          100: "#e8ebff",
          200: "#c9d0ff",
          300: "#9aa9ff",
          400: "#6b82ff",
          500: "#3f5bff",
          600: "#2d46db",
          700: "#2438b1",
          800: "#1f2f8d",
          900: "#1b2a73"
        }
      },
      animation: {
        "timer-pulse": "timer-pulse 1s ease-in-out infinite",
        "confetti-fall": "confetti-fall var(--duration, 2s) ease-out forwards",
        "gentle-glow": "gentle-glow 2s ease-in-out infinite"
      },
      keyframes: {
        "timer-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" }
        },
        "confetti-fall": {
          "0%": { opacity: "1", transform: "translateY(0) translateX(0) rotate(0deg)" },
          "100%": { opacity: "0", transform: "translateY(120px) translateX(var(--drift, 0px)) rotate(720deg)" }
        },
        "gentle-glow": {
          "0%, 100%": { boxShadow: "0 0 4px 0 rgba(108, 63, 219, 0.3)" },
          "50%": { boxShadow: "0 0 12px 2px rgba(108, 63, 219, 0.5)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
