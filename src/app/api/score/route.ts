import { z } from "zod";
import {
  authorizeSubmission,
  normalizeScore,
  issueScoreReceipt,
  rateLimit,
} from "@/lib/anticheat";
import { getGame } from "@/game/registry";
import { tierForHeight } from "@/lib/tiers";
import { clientIp, ok, bad, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  game: z.string().min(1),
  score: z.number().finite().nonnegative(), // client-reported height
  durationMs: z.number().finite().nonnegative(),
});

// Validate a finished run server-side. NEVER trusts the client number: the score
// is re-checked against the signed session + the elapsed play time. On success
// we return a signed receipt that the lead form needs to write to a board.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`score:${ip}`, 30, 10)) return tooMany();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return bad("invalid_body");
  const { token, game, score, durationMs } = parsed.data;

  if (!getGame(game)) return bad("unknown_game");

  // 1) Authorise the session token (signature, freshness, single-use).
  const auth = authorizeSubmission(token);
  if (!auth.ok || !auth.payload) return bad(auth.reason ?? "unauthorized", 403);
  if (auth.payload.gid !== game) return bad("game_mismatch", 403);

  // 2) Normalise the score against physical limits for the elapsed time.
  const norm = normalizeScore(game, score, durationMs, auth.tokenAgeMs ?? 0);
  if (!norm.ok) {
    return bad(`rejected:${norm.reason}`, 422);
  }

  const tier = tierForHeight(norm.score);
  const receipt = issueScoreReceipt({
    game,
    height: norm.score,
    tier: tier.key,
    durationMs: Math.round(durationMs),
  });

  return ok({
    verified: true,
    height: norm.score,
    tier: { key: tier.key, title: tier.title, earnings: tier.earnings },
    receipt,
  });
}
