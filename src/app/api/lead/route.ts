import { z } from "zod";
import { verifyScoreReceipt, rateLimit } from "@/lib/anticheat";
import { getStore } from "@/lib/store";
import { tierForHeight } from "@/lib/tiers";
import { SEGMENT_KEYS } from "@/lib/segments";
import { weeklyPeriodKey, SEASON_EPOCH } from "@/lib/leaderboard";
import { postLeadToCrm } from "@/lib/crm";
import { clientIp, ok, bad, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    receipt: z.string().min(10),
    name: z.string().trim().min(1).max(60),
    displayName: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().email().optional().or(z.literal("")),
    whatsapp: z.string().trim().min(6).max(24).optional().or(z.literal("")),
    segment: z.enum(SEGMENT_KEYS as [string, ...string[]]),
    office: z.string().trim().max(60).optional().or(z.literal("")),
    code: z.string().trim().max(40).optional().or(z.literal("")),
    consent: z.literal(true), // explicit consent is mandatory to store
  })
  .refine((d) => (d.email && d.email.length) || (d.whatsapp && d.whatsapp.length), {
    message: "email_or_whatsapp_required",
  });

// The commercial core: save a verified score to the leaderboard AND forward the
// lead to the CRM, tagged with segment + source code. Requires a signed receipt
// from /api/score, so only server-verified scores ever reach a board.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`lead:${ip}`, 20, 8)) return tooMany();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "invalid_body");
  }
  const d = parsed.data;

  const receipt = verifyScoreReceipt(d.receipt);
  if (!receipt) return bad("invalid_or_expired_receipt", 403);

  const store = getStore();
  const tier = tierForHeight(receipt.height);
  const displayName = (d.displayName || d.name.split(" ")[0]).slice(0, 40);
  const office = d.office || null;
  const email = d.email || null;
  const whatsapp = d.whatsapp || null;
  const segment = d.segment as (typeof SEGMENT_KEYS)[number];
  const sourceCode = d.code || null;

  // 1) Write the verified score to the leaderboard.
  const saved = await store.saveScore({
    game: receipt.game,
    displayName,
    height: receipt.height,
    score: receipt.height,
    tier: tier.key,
    office,
    segment,
    weekKey: weeklyPeriodKey(),
    season: SEASON_EPOCH,
  });

  // 2) Persist the lead.
  const nowIso = new Date().toISOString();
  await store.upsertLead({
    name: d.name,
    email,
    whatsapp,
    segment,
    sourceCode,
    office,
    game: receipt.game,
    bestScore: receipt.height,
    consent: true,
    consentAt: nowIso,
  });

  // 3) Forward to the CRM (never blocks the save on failure).
  const crm = await postLeadToCrm({
    name: d.name,
    email: email ?? undefined,
    whatsapp: whatsapp ?? undefined,
    segment,
    sourceCode: sourceCode ?? undefined,
    office: office ?? undefined,
    game: receipt.game,
    score: receipt.height,
    height: receipt.height,
    tier: tier.key,
    consent: true,
    capturedAt: nowIso,
  });

  return ok({
    saved: true,
    scoreId: saved.id,
    height: receipt.height,
    tier: { key: tier.key, title: tier.title },
    crmDelivered: crm.delivered,
  });
}
