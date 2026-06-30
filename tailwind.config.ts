import type { Config } from "tailwindcss";

// betterhomes brand palette. Salmon is reserved for CTA buttons only.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: "#1F343F",
        denim: "#2C537A",
        powder: "#7BA0B2",
        sand: "#D9B9A0",
        mist: "#EDE8E4",
        salmon: "#FF787A",
      },
      fontFamily: {
        // Headlines: Georgia/Ivy Mode. Body: Segoe UI/Ivy Epic.
        head: ['"Ivy Mode"', "Georgia", "serif"],
        body: ['"Ivy Epic"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 8px 30px rgba(31, 52, 63, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
