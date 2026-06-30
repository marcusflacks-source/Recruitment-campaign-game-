import { getStore } from "@/lib/store";
import { BETTERHOMES_OFFICES } from "@/lib/offices";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Office list for the office-vs-office board + capture form. Merges the canonical
// betterhomes office list with any offices already present in the store.
export async function GET() {
  const store = getStore();
  const fromScores = await store.listOffices();
  const merged = [...new Set([...BETTERHOMES_OFFICES, ...fromScores])].sort();
  return ok({ offices: merged });
}
