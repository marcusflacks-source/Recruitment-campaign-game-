import { config } from "./config";
import type { SegmentKey } from "./segments";

// Posts captured leads to a configurable CRM webhook. This is the commercial
// point of the build: a saved score becomes a tagged recruitment lead.

export interface CrmLeadPayload {
  name: string;
  email?: string;
  whatsapp?: string;
  segment: SegmentKey;
  /** Referral / source code from ?code= (links physical puzzles to a profile). */
  sourceCode?: string;
  office?: string;
  game: string;
  score: number;
  height: number;
  tier: string;
  consent: boolean;
  capturedAt: string; // ISO timestamp
}

export interface CrmResult {
  delivered: boolean;
  status?: number;
  skippedReason?: string;
}

/**
 * Fire-and-confirm POST to the CRM. Returns delivery status but never throws —
 * a CRM outage must not block the player's score from being saved.
 */
export async function postLeadToCrm(payload: CrmLeadPayload): Promise<CrmResult> {
  if (!config.crm.enabled) {
    // No endpoint configured: log so leads aren't silently lost in dev.
    console.info("[crm] webhook not configured — lead not forwarded:", {
      email: payload.email,
      whatsapp: payload.whatsapp,
      segment: payload.segment,
      sourceCode: payload.sourceCode,
    });
    return { delivered: false, skippedReason: "no_webhook_configured" };
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.crm.webhookToken) {
    headers["authorization"] = `Bearer ${config.crm.webhookToken}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(config.crm.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "betterhomes-careers-play",
        campaign: "trust-better-get-better",
        ...payload,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { delivered: res.ok, status: res.status };
  } catch (err) {
    console.error("[crm] webhook delivery failed:", err);
    return { delivered: false, skippedReason: "delivery_error" };
  }
}
