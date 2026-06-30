// Career tiers for "Break the ceiling". Height (the score) maps to a tier; each
// broken ceiling nudges the player up the ladder with a rising earnings cue.
//
// These thresholds are also used server-side for the OG score card, so the
// shared module keeps the game and the share image perfectly in sync.

export interface CareerTier {
  key: string;
  /** Display title shown in-game and on the share card. */
  title: string;
  /** Minimum height (score) required to reach this tier. */
  minHeight: number;
  /** Rising earnings / role indicator copy. */
  earnings: string;
  /** Accent colour drawn from the brand palette. */
  color: string;
}

export const CAREER_TIERS: CareerTier[] = [
  { key: "new", title: "New broker", minHeight: 0, earnings: "Base + commission", color: "#7BA0B2" },
  { key: "top", title: "Top performer", minHeight: 250, earnings: "Top-tier commission", color: "#2C537A" },
  { key: "lead", title: "Team lead", minHeight: 650, earnings: "Override on the team", color: "#D9B9A0" },
  // Bronze (deep sand) — distinct top-tier accent. Salmon stays CTA-only.
  { key: "director", title: "Director", minHeight: 1200, earnings: "Equity in the upside", color: "#B07A4F" },
];

/** Resolve the career tier for a given height. */
export function tierForHeight(height: number): CareerTier {
  let current = CAREER_TIERS[0];
  for (const tier of CAREER_TIERS) {
    if (height >= tier.minHeight) current = tier;
  }
  return current;
}

/** The next tier above the current height, or null if already at the top. */
export function nextTier(height: number): CareerTier | null {
  for (const tier of CAREER_TIERS) {
    if (height < tier.minHeight) return tier;
  }
  return null;
}
