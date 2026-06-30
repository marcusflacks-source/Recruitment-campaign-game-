import { getStore } from "@/lib/store";
import { isAnalyticsEvent, type AnalyticsPayload } from "@/lib/analytics";
import { rateLimit } from "@/lib/anticheat";
import { clientIp, ok, bad, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analytics sink. Stores play_start, play_end, score_saved, lead_captured,
// share_clicked — each tagged with the audience segment for funnel analysis.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`analytics:${ip}`, 240, 60)) return tooMany();

  let json: Partial<AnalyticsPayload>;
  try {
    json = await req.json();
  } catch {
    return bad("invalid_json");
  }
  if (!isAnalyticsEvent(json.event) || typeof json.game !== "string") {
    return bad("invalid_event");
  }

  await getStore().recordEvent({
    event: json.event,
    game: json.game,
    segment: json.segment ?? null,
    score: typeof json.score === "number" ? json.score : undefined,
    meta: json.meta ?? {},
    ts: typeof json.ts === "number" ? json.ts : Date.now(),
    receivedAt: new Date().toISOString(),
  });

  // sendBeacon ignores the body; 204 keeps it cheap.
  return new Response(null, { status: 204 });
}
