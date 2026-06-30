import crypto from "node:crypto";
import { config } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Anti-cheat. We NEVER trust a client-reported score blindly. Three lines of
// defence, all server-side:
//   1. Signed play-session token — issued at play_start, required to submit.
//      Prevents fabricated submissions and replay (single-use nonce).
//   2. Score normalisation — a score is only accepted if it is physically
//      reachable in the elapsed play time for that game's difficulty curve.
//   3. Rate limiting — caps submissions per client to blunt grinding/scripting.
// ─────────────────────────────────────────────────────────────────────────────

if (!config.hasSigningSecret) {
  // Surfaced once at module load so misconfig is obvious in logs.
  console.warn(
    "[anticheat] SCORE_SIGNING_SECRET is not set — using an insecure dev default. " +
      "Set it before deploying.",
  );
}

const TOKEN_TTL_MS = 15 * 60 * 1000; // a run must be submitted within 15 min

export interface PlayToken {
  sid: string; // session id
  gid: string; // game id
  iat: number; // issued-at (ms epoch)
  nonce: string;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", config.signingSecret)
    .update(payload)
    .digest("base64url");
}

/** Issue a signed token for a new play session. */
export function issuePlayToken(gameId: string): { token: string; sessionId: string } {
  const sid = crypto.randomUUID();
  const body: PlayToken = {
    sid,
    gid: gameId,
    iat: Date.now(),
    nonce: crypto.randomBytes(12).toString("base64url"),
  };
  const payload = b64url(JSON.stringify(body));
  const token = `${payload}.${sign(payload)}`;
  return { token, sessionId: sid };
}

/** Verify a token's signature + freshness. Returns the payload or null. */
export function verifyPlayToken(token: string): PlayToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload);
  // Constant-time compare.
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  let body: PlayToken;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof body.iat !== "number") return null;
  const age = Date.now() - body.iat;
  if (age < 0 || age > TOKEN_TTL_MS) return null;
  return body;
}

// ── Single-use nonce store (replay protection) ──────────────────────────────
// In-memory is fine for a single instance; for multi-instance serverless back
// this with Redis/Upstash (see README). Entries self-expire after the TTL.
const usedNonces = new Map<string, number>();
function consumeNonce(nonce: string): boolean {
  const now = Date.now();
  // opportunistic cleanup
  if (usedNonces.size > 5000) {
    for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  }
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, now + TOKEN_TTL_MS);
  return true;
}

// ── Per-game difficulty model for score normalisation ───────────────────────
// Height accrues as the player climbs. The fastest *physically possible* climb
// rate bounds the score for a given play duration. Tuned to comfortably exceed
// expert human play while rejecting impossible jumps.
interface GameRules {
  maxHeightPerSec: number; // hard ceiling on climb rate
  minSecForScore: (score: number) => number; // floor on time to reach a score
  absoluteMax: number; // sanity cap
}

const GAME_RULES: Record<string, GameRules> = {
  "break-the-ceiling": {
    maxHeightPerSec: 60,
    // Difficulty ramps, so high scores must take proportionally longer. No fixed
    // floor: a legitimate quick death (low height, ~1s) must still be saveable —
    // capturing that lead is the point. The upper climb-rate bound + the
    // duration-can't-exceed-token-age check are what stop fabricated high scores.
    minSecForScore: (s) => s / 58,
    absoluteMax: 100000,
  },
};

export interface NormalizeResult {
  ok: boolean;
  score: number; // normalised (clamped) score
  reason?: string;
}

/**
 * Validate + normalise a client-reported score against the elapsed play time.
 * `durationMs` is the client-claimed run length; it is independently bounded by
 * the token age so it cannot be inflated arbitrarily.
 */
export function normalizeScore(
  gameId: string,
  rawScore: number,
  durationMs: number,
  tokenAgeMs: number,
): NormalizeResult {
  const rules = GAME_RULES[gameId];
  if (!rules) return { ok: false, score: 0, reason: "unknown_game" };

  if (!Number.isFinite(rawScore) || rawScore < 0) {
    return { ok: false, score: 0, reason: "invalid_score" };
  }
  const score = Math.floor(rawScore);

  // Duration can't exceed how long the token has actually existed (+1s slack),
  // and can't be implausibly short.
  const durSec = Math.max(0, durationMs) / 1000;
  const maxPlausibleSec = tokenAgeMs / 1000 + 1;
  if (durSec > maxPlausibleSec) {
    return { ok: false, score: 0, reason: "duration_exceeds_session" };
  }

  if (score > rules.absoluteMax) {
    return { ok: false, score: 0, reason: "score_above_absolute_max" };
  }

  // Climb-rate ceiling.
  const maxForDuration = Math.ceil(rules.maxHeightPerSec * (durSec + 0.5));
  if (score > maxForDuration) {
    return { ok: false, score: 0, reason: "score_too_fast" };
  }

  // Minimum time for the score (difficulty ramp).
  if (durSec + 0.5 < rules.minSecForScore(score)) {
    return { ok: false, score: 0, reason: "score_too_fast" };
  }

  return { ok: true, score };
}

/** Verify a token AND consume its nonce (call once per submission). */
export function authorizeSubmission(token: string): {
  ok: boolean;
  payload?: PlayToken;
  tokenAgeMs?: number;
  reason?: string;
} {
  const payload = verifyPlayToken(token);
  if (!payload) return { ok: false, reason: "invalid_or_expired_token" };
  if (!consumeNonce(payload.nonce)) return { ok: false, reason: "token_already_used" };
  return { ok: true, payload, tokenAgeMs: Date.now() - payload.iat };
}

// ── Score receipts ──────────────────────────────────────────────────────────
// After /api/score validates a run, it issues a signed "receipt". Only a valid
// receipt can write to a leaderboard (via /api/lead). This guarantees the board
// only ever stores server-verified scores — the client can't save a raw number.
const RECEIPT_TTL_MS = 30 * 60 * 1000;

export interface ScoreReceipt {
  game: string;
  height: number;
  tier: string;
  durationMs: number;
  iat: number;
}

export function issueScoreReceipt(r: Omit<ScoreReceipt, "iat">): string {
  const body: ScoreReceipt = { ...r, iat: Date.now() };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

export function verifyScoreReceipt(token: string): ScoreReceipt | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const body: ScoreReceipt = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof body.iat !== "number" || Date.now() - body.iat > RECEIPT_TTL_MS) return null;
    return body;
  } catch {
    return null;
  }
}

// ── Simple in-memory rate limiter (token bucket per key) ────────────────────
const buckets = new Map<string, { tokens: number; updated: number }>();
export function rateLimit(key: string, ratePerMin = 20, burst = 10): boolean {
  const now = Date.now();
  const refillPerMs = ratePerMin / 60000;
  const b = buckets.get(key) ?? { tokens: burst, updated: now };
  b.tokens = Math.min(burst, b.tokens + (now - b.updated) * refillPerMs);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}
