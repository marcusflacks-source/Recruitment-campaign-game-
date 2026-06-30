// betterhomes brand tokens. Single source of truth for palette + copy rules.
// Brand name is ALWAYS lowercase 'betterhomes'. Salmon is CTA-only.

export const BRAND = {
  name: "betterhomes",
  campaign: "Trust better. Get better.",
  palette: {
    slate: "#1F343F",
    denim: "#2C537A",
    powder: "#7BA0B2",
    sand: "#D9B9A0",
    mist: "#EDE8E4",
    salmon: "#FF787A", // CTA buttons only
  },
} as const;

export type PaletteKey = keyof typeof BRAND.palette;
