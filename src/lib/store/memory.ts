import crypto from "node:crypto";
import type {
  Store,
  ScoreRecord,
  LeadRecord,
  LeaderboardEntry,
  SaveScoreInput,
  LeaderboardQuery,
} from "./types";
import type { AnalyticsPayload } from "../analytics";

// In-memory store. Zero-config fallback for local dev, demos and tests.
// Data resets when the process restarts. Production should set Supabase env.
//
// NOTE: module-level state is shared across requests within one server
// instance. It deliberately persists between hot reloads via globalThis so the
// dev leaderboard doesn't wipe on every code change.

interface MemoryDb {
  scores: ScoreRecord[];
  leads: LeadRecord[];
  events: (AnalyticsPayload & { receivedAt: string })[];
  offices: Set<string>;
}

const g = globalThis as unknown as { __bh_mem?: MemoryDb };
const db: MemoryDb =
  g.__bh_mem ??
  (g.__bh_mem = {
    scores: [],
    leads: [],
    events: [],
    offices: new Set<string>(),
  });

export class MemoryStore implements Store {
  async saveScore(input: SaveScoreInput): Promise<ScoreRecord> {
    const rec: ScoreRecord = {
      id: crypto.randomUUID(),
      game: input.game,
      displayName: input.displayName.slice(0, 40),
      height: input.height,
      score: input.score,
      tier: input.tier,
      office: input.office ?? null,
      segment: input.segment ?? null,
      weekKey: input.weekKey,
      season: input.season,
      createdAt: new Date().toISOString(),
    };
    db.scores.push(rec);
    if (rec.office) db.offices.add(rec.office);
    return rec;
  }

  async topScores(q: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const limit = q.limit ?? 50;
    let rows = db.scores.filter((s) => s.game === q.game && s.season === q.season);
    if (q.scope === "weekly" && q.weekKey) {
      rows = rows.filter((s) => s.weekKey === q.weekKey);
    }
    if (q.scope === "office" && q.office) {
      rows = rows.filter((s) => s.office === q.office);
    }
    // Keep each player's best only (dedupe by display name for a clean board).
    const best = new Map<string, ScoreRecord>();
    for (const s of rows) {
      const key = s.displayName.toLowerCase();
      const cur = best.get(key);
      if (!cur || s.height > cur.height) best.set(key, s);
    }
    return [...best.values()]
      .sort((a, b) => b.height - a.height || a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((s, i) => ({
        rank: i + 1,
        displayName: s.displayName,
        height: s.height,
        tier: s.tier,
        office: s.office,
        createdAt: s.createdAt,
      }));
  }

  async getScore(id: string): Promise<ScoreRecord | null> {
    return db.scores.find((s) => s.id === id) ?? null;
  }

  async bestHeight(game: string): Promise<number> {
    return db.scores
      .filter((s) => s.game === game)
      .reduce((max, s) => Math.max(max, s.height), 0);
  }

  async listOffices(): Promise<string[]> {
    return [...db.offices].sort();
  }

  async upsertLead(lead: Omit<LeadRecord, "id" | "createdAt">): Promise<LeadRecord> {
    const handle = (lead.email || lead.whatsapp || "").toLowerCase();
    const existing = db.leads.find(
      (l) => (l.email || l.whatsapp || "").toLowerCase() === handle && handle !== "",
    );
    if (existing) {
      existing.name = lead.name;
      existing.segment = lead.segment;
      existing.sourceCode = lead.sourceCode ?? existing.sourceCode;
      existing.office = lead.office ?? existing.office;
      existing.bestScore = Math.max(existing.bestScore, lead.bestScore);
      existing.consent = lead.consent;
      existing.consentAt = lead.consentAt;
      return existing;
    }
    const rec: LeadRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...lead,
    };
    db.leads.push(rec);
    if (rec.office) db.offices.add(rec.office);
    return rec;
  }

  async deleteLeadByContact(contact: string): Promise<{ deleted: number }> {
    const c = contact.toLowerCase();
    const before = db.leads.length;
    db.leads = db.leads.filter(
      (l) => (l.email || "").toLowerCase() !== c && (l.whatsapp || "").toLowerCase() !== c,
    );
    return { deleted: before - db.leads.length };
  }

  async recordEvent(event: AnalyticsPayload & { receivedAt: string }): Promise<void> {
    db.events.push(event);
    if (db.events.length > 10000) db.events.splice(0, db.events.length - 10000);
  }
}
