import type { SegmentKey } from "../segments";
import type { BoardScope } from "../leaderboard";
import type { AnalyticsPayload } from "../analytics";

// Storage contract. The leaderboard + lead-capture services depend ONLY on this
// interface — never on a concrete DB. That is what lets a second game plug in
// with zero changes to these services: a new game just reuses the same store.

export interface ScoreRecord {
  id: string;
  game: string;
  displayName: string;
  height: number;
  score: number;
  tier: string;
  office: string | null;
  segment: SegmentKey | null;
  /** Weekly partition key (Monday GST) at time of save. */
  weekKey: string;
  season: string;
  createdAt: string; // ISO
}

export interface LeadRecord {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  segment: SegmentKey;
  sourceCode: string | null;
  office: string | null;
  game: string;
  bestScore: number;
  consent: boolean;
  consentAt: string | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  height: number;
  tier: string;
  office: string | null;
  createdAt: string;
}

export interface SaveScoreInput {
  game: string;
  displayName: string;
  height: number;
  score: number;
  tier: string;
  office?: string | null;
  segment?: SegmentKey | null;
  weekKey: string;
  season: string;
}

export interface LeaderboardQuery {
  game: string;
  scope: BoardScope;
  weekKey?: string;
  season: string;
  office?: string | null;
  limit?: number;
}

export interface Store {
  saveScore(input: SaveScoreInput): Promise<ScoreRecord>;
  topScores(q: LeaderboardQuery): Promise<LeaderboardEntry[]>;
  getScore(id: string): Promise<ScoreRecord | null>;
  /** Best height for a game (used for challenge / "score to beat"). */
  bestHeight(game: string): Promise<number>;
  listOffices(): Promise<string[]>;

  upsertLead(lead: Omit<LeadRecord, "id" | "createdAt">): Promise<LeadRecord>;
  /** PDPL/GDPR: hard-delete a lead and detach their scores by contact handle. */
  deleteLeadByContact(contact: string): Promise<{ deleted: number }>;

  recordEvent(event: AnalyticsPayload & { receivedAt: string }): Promise<void>;
}
