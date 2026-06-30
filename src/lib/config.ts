// Centralised, server-side runtime configuration. Read from env with safe
// dev defaults so the hub boots with zero setup.

export const config = {
  signingSecret:
    process.env.SCORE_SIGNING_SECRET ||
    // Dev-only fallback. A warning is logged in anticheat.ts when this is used.
    "dev-insecure-secret-change-me",
  hasSigningSecret: Boolean(process.env.SCORE_SIGNING_SECRET),

  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    get enabled() {
      return Boolean(this.url && this.serviceKey);
    },
  },

  crm: {
    webhookUrl: process.env.CRM_WEBHOOK_URL || "",
    webhookToken: process.env.CRM_WEBHOOK_TOKEN || "",
    get enabled() {
      return Boolean(this.webhookUrl);
    },
  },

  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "",
} as const;

/** Resolve the public site origin, preferring env then the incoming request. */
export function siteOrigin(req?: Request): string {
  if (config.siteUrl) return config.siteUrl.replace(/\/$/, "");
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:3000";
}
