import { z } from "zod";
import { getStore } from "@/lib/store";
import { rateLimit } from "@/lib/anticheat";
import { clientIp, ok, bad, tooMany } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ contact: z.string().trim().min(3).max(120) });

// PDPL/GDPR data-deletion endpoint. A person can erase their stored lead by
// supplying the email or WhatsApp number they signed up with. Hard delete.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`delete:${ip}`, 10, 5)) return tooMany();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return bad("invalid_json");
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return bad("invalid_body");

  const { deleted } = await getStore().deleteLeadByContact(parsed.data.contact.toLowerCase());
  return ok({ deleted });
}
