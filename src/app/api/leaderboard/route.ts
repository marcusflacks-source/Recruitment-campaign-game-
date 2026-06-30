import { getStore } from "@/lib/store";
import {
  weeklyPeriodKey,
  msUntilWeeklyReset,
  SEASON_EPOCH,
  type BoardScope,
} from "@/lib/leaderboard";
import { getGame } from "@/game/registry";
import { ok, bad } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES: BoardScope[] = ["global", "weekly", "office"];

// Read a leaderboard. Public, PII-free: only display name, height, tier, office.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = url.searchParams.get("game") ?? "";
  const scope = (url.searchParams.get("scope") ?? "weekly") as BoardScope;
  const office = url.searchParams.get("office");
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25) || 25);

  if (!getGame(game)) return bad("unknown_game");
  if (!SCOPES.includes(scope)) return bad("unknown_scope");
  if (scope === "office" && !office) return bad("office_required");

  const store = getStore();
  const entries = await store.topScores({
    game,
    scope,
    season: SEASON_EPOCH,
    weekKey: scope === "weekly" ? weeklyPeriodKey() : undefined,
    office: scope === "office" ? office : undefined,
    limit,
  });

  return ok({
    scope,
    office: scope === "office" ? office : null,
    weekKey: scope === "weekly" ? weeklyPeriodKey() : null,
    resetsInMs: scope === "weekly" ? msUntilWeeklyReset() : null,
    season: SEASON_EPOCH,
    entries,
  });
}
