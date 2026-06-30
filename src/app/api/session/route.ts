import { issuePlayToken, rateLimit } from "@/lib/anticheat";
import { getGame } from "@/game/registry";
import { clientIp, ok, bad, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issue a signed play-session token at play_start. Required to submit a score,
// so fabricated submissions without a real session are rejected downstream.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`session:${ip}`, 60, 20)) return tooMany();

  let body: { game?: string };
  try {
    body = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const gameId = body.game ?? "";
  if (!getGame(gameId)) return bad("unknown_game");

  const { token, sessionId } = issuePlayToken(gameId);
  return ok({ token, sessionId });
}
