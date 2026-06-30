// Leaderboard period maths. Weekly boards reset Monday 00:00 GST (Gulf Standard
// Time, UTC+4, no DST). We derive a stable "period key" string for each week so
// the store can bucket scores without a scheduled job — the key simply changes
// when the new week begins, and seasonal resets bump a configurable epoch.

export const GST_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4, fixed

export type BoardScope = "global" | "weekly" | "office";

/**
 * Returns the ISO date (YYYY-MM-DD) of the Monday that begins the GST week
 * containing `now`. Used as the weekly leaderboard partition key.
 */
export function weeklyPeriodKey(now: Date = serverNow()): string {
  // Shift into GST, then find the most recent Monday at 00:00 GST.
  const gst = new Date(now.getTime() + GST_OFFSET_MS);
  const day = gst.getUTCDay(); // 0=Sun..6=Sat in the shifted clock
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(gst.getUTCFullYear(), gst.getUTCMonth(), gst.getUTCDate()) -
      daysSinceMonday * 24 * 60 * 60 * 1000,
  );
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Milliseconds until the current GST week rolls over (for countdowns). */
export function msUntilWeeklyReset(now: Date = serverNow()): number {
  const gst = new Date(now.getTime() + GST_OFFSET_MS);
  const day = gst.getUTCDay();
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  const nextMondayGst = new Date(
    Date.UTC(gst.getUTCFullYear(), gst.getUTCMonth(), gst.getUTCDate()) +
      daysUntilNextMonday * 24 * 60 * 60 * 1000,
  );
  // Convert that GST instant back to real UTC.
  return nextMondayGst.getTime() - GST_OFFSET_MS - now.getTime();
}

/**
 * Seasonal epoch. Bump SEASON_EPOCH (env or constant) to wipe the slate for a
 * new season without deleting history — boards filter on the active season.
 */
export const SEASON_EPOCH = process.env.SEASON_EPOCH || "2026-s1";

/** Compute the period key for a given scope. */
export function periodKeyFor(scope: BoardScope, now: Date = serverNow()): string {
  if (scope === "weekly") return weeklyPeriodKey(now);
  return "all-time";
}

// Centralised "now" so tests/seeding can stub it if needed.
export function serverNow(): Date {
  return new Date();
}
