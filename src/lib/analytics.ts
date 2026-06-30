// Analytics event contract, shared by client emitter and server sink.
// Every event is tagged with the audience segment (when known) so the funnel
// can be sliced by who the player is.

export const ANALYTICS_EVENTS = [
  "play_start",
  "play_end",
  "score_saved",
  "lead_captured",
  "share_clicked",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsPayload {
  event: AnalyticsEvent;
  game: string;
  segment?: string | null;
  score?: number;
  /** Free-form context: tier, board scope, share channel, source code, etc. */
  meta?: Record<string, string | number | boolean | null>;
  /** Client timestamp (ms). Server also stamps its own received-at. */
  ts: number;
}

/**
 * Client-side emitter. Uses sendBeacon when available so events survive page
 * unload (important for play_end / share_clicked). Falls back to fetch.
 */
export function emit(
  event: AnalyticsEvent,
  data: Omit<AnalyticsPayload, "event" | "ts"> & { ts?: number },
): void {
  if (typeof window === "undefined") return;
  const payload: AnalyticsPayload = {
    event,
    ts: data.ts ?? Date.now(),
    game: data.game,
    segment: data.segment ?? null,
    score: data.score,
    meta: data.meta,
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function isAnalyticsEvent(v: unknown): v is AnalyticsEvent {
  return typeof v === "string" && (ANALYTICS_EVENTS as readonly string[]).includes(v);
}
