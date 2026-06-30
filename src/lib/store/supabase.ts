import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type {
  Store,
  ScoreRecord,
  LeadRecord,
  LeaderboardEntry,
  SaveScoreInput,
  LeaderboardQuery,
} from "./types";
import type { AnalyticsPayload } from "../analytics";

// Supabase-backed store. Uses the service-role key on the server only.
// Schema lives in /supabase/schema.sql. Tables: scores, leads, analytics_events.

function mapScore(row: Record<string, unknown>): ScoreRecord {
  return {
    id: row.id as string,
    game: row.game as string,
    displayName: row.display_name as string,
    height: row.height as number,
    score: row.score as number,
    tier: row.tier as string,
    office: (row.office as string) ?? null,
    segment: (row.segment as ScoreRecord["segment"]) ?? null,
    weekKey: row.week_key as string,
    season: row.season as string,
    createdAt: row.created_at as string,
  };
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor() {
    this.db = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false },
    });
  }

  async saveScore(input: SaveScoreInput): Promise<ScoreRecord> {
    const { data, error } = await this.db
      .from("scores")
      .insert({
        game: input.game,
        display_name: input.displayName.slice(0, 40),
        height: input.height,
        score: input.score,
        tier: input.tier,
        office: input.office ?? null,
        segment: input.segment ?? null,
        week_key: input.weekKey,
        season: input.season,
      })
      .select()
      .single();
    if (error) throw error;
    return mapScore(data);
  }

  async topScores(q: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    let query = this.db
      .from("scores")
      .select("display_name, height, tier, office, created_at")
      .eq("game", q.game)
      .eq("season", q.season)
      .order("height", { ascending: false })
      .limit((q.limit ?? 50) * 4); // over-fetch to allow per-player dedupe
    if (q.scope === "weekly" && q.weekKey) query = query.eq("week_key", q.weekKey);
    if (q.scope === "office" && q.office) query = query.eq("office", q.office);

    const { data, error } = await query;
    if (error) throw error;

    const best = new Map<string, (typeof data)[number]>();
    for (const s of data ?? []) {
      const key = (s.display_name as string).toLowerCase();
      const cur = best.get(key);
      if (!cur || (s.height as number) > (cur.height as number)) best.set(key, s);
    }
    return [...best.values()]
      .sort((a, b) => (b.height as number) - (a.height as number))
      .slice(0, q.limit ?? 50)
      .map((s, i) => ({
        rank: i + 1,
        displayName: s.display_name as string,
        height: s.height as number,
        tier: s.tier as string,
        office: (s.office as string) ?? null,
        createdAt: s.created_at as string,
      }));
  }

  async getScore(id: string): Promise<ScoreRecord | null> {
    const { data, error } = await this.db.from("scores").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapScore(data) : null;
  }

  async bestHeight(game: string): Promise<number> {
    const { data, error } = await this.db
      .from("scores")
      .select("height")
      .eq("game", game)
      .order("height", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.height as number) ?? 0;
  }

  async listOffices(): Promise<string[]> {
    const { data, error } = await this.db.from("scores").select("office").not("office", "is", null);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.office as string))].sort();
  }

  async upsertLead(lead: Omit<LeadRecord, "id" | "createdAt">): Promise<LeadRecord> {
    // Conflict target is the contact handle; see schema unique index.
    const { data, error } = await this.db
      .from("leads")
      .upsert(
        {
          name: lead.name,
          email: lead.email,
          whatsapp: lead.whatsapp,
          segment: lead.segment,
          source_code: lead.sourceCode,
          office: lead.office,
          game: lead.game,
          best_score: lead.bestScore,
          consent: lead.consent,
          consent_at: lead.consentAt,
        },
        { onConflict: "contact_handle" },
      )
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      whatsapp: data.whatsapp,
      segment: data.segment,
      sourceCode: data.source_code,
      office: data.office,
      game: data.game,
      bestScore: data.best_score,
      consent: data.consent,
      consentAt: data.consent_at,
      createdAt: data.created_at,
    };
  }

  async deleteLeadByContact(contact: string): Promise<{ deleted: number }> {
    const { data, error } = await this.db
      .from("leads")
      .delete()
      .or(`email.eq.${contact},whatsapp.eq.${contact}`)
      .select("id");
    if (error) throw error;
    return { deleted: (data ?? []).length };
  }

  async recordEvent(event: AnalyticsPayload & { receivedAt: string }): Promise<void> {
    const { error } = await this.db.from("analytics_events").insert({
      event: event.event,
      game: event.game,
      segment: event.segment,
      score: event.score ?? null,
      meta: event.meta ?? {},
      client_ts: new Date(event.ts).toISOString(),
      received_at: event.receivedAt,
    });
    if (error) console.error("[supabase] analytics insert failed:", error.message);
  }
}
