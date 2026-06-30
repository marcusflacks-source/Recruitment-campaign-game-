// betterhomes voice: intelligent, witty, confident. Sentence case, no shouting.
// Shared by the game (in-run toasts) and the hub (result-screen quip) so the
// tone is identical wherever copy appears.

// Career milestones surfaced as you climb — the diegetic "Dubai broker" story.
// Each is shown once, the first time its height is crossed.
export interface Milestone {
  atHeight: number;
  label: string;
}

export const MILESTONES: Milestone[] = [
  { atHeight: 30, label: "First listing" },
  { atHeight: 80, label: "First AED 1M deal" },
  { atHeight: 150, label: "A client came back" },
  { atHeight: 320, label: "Palm Jumeirah villa, sold" },
  { atHeight: 500, label: "Your name travels on referrals" },
  { atHeight: 800, label: "A team of your own" },
  { atHeight: 1100, label: "Record quarter" },
  { atHeight: 1500, label: "Above the Burj — thin air up here" },
];

/** The milestone newly crossed between two heights, or null. */
export function milestoneCrossed(prev: number, next: number): Milestone | null {
  for (const m of MILESTONES) {
    if (prev < m.atHeight && next >= m.atHeight) return m;
  }
  return null;
}

/** Said when you enter a new tier mid-run. */
export function tierUpQuip(tierKey: string): string {
  switch (tierKey) {
    case "top":
      return "The market noticed.";
    case "lead":
      return "Other people's numbers are yours now too.";
    case "director":
      return "Now you're just showing off.";
    default:
      return "";
  }
}

/** Said on the result screen, scaled to how high you got. */
export function gameOverQuip(height: number, tierKey: string): string {
  if (height <= 10) {
    return "Straight into the concrete. Every director bonked their first ceiling too.";
  }
  switch (tierKey) {
    case "new":
      return "New broker energy. The first ceiling is always the hardest.";
    case "top":
      return "Top performer. Most people stop here. Most people.";
    case "lead":
      return "Team lead, and you made it look deliberate.";
    case "director":
      return "Director. The ceiling called; it's giving up.";
    default:
      return "Not bad. The market rewards another try.";
  }
}
