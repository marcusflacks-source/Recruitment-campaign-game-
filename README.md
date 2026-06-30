# betterhomes game hub — _Trust better. Get better._

A mobile-first, browser-based recruitment game hub for **betterhomes** (Dubai
real estate). Its primary purpose is **lead generation for broker recruitment**:
anyone can play instantly, and saving a score captures a tagged CRM lead.

The hub ships with one flagship game — **Break the ceiling** — plus a shared
leaderboard + lead-capture backend that future games plug into without touching
the services.

> Brand note: the name is always lowercase **betterhomes**. Salmon `#FF787A` is
> used for CTA buttons only; body copy is sentence case, never ALL CAPS.

---

## What's in the box

| Deliverable | Where |
| --- | --- |
| Flagship game (endless climber, career tiers, difficulty ramp) | `src/game/modules/breakTheCeiling/` |
| Pluggable game host + registry | `src/game/GameHost.tsx`, `src/game/registry.ts` |
| Hub shell (`/careers/play`) | `src/app/careers/play/`, `src/components/` |
| Leaderboard service (global / weekly / office) + anti-cheat | `src/app/api/leaderboard`, `src/app/api/score`, `src/lib/anticheat.ts` |
| Lead capture + CRM webhook + consent | `src/app/api/lead`, `src/components/LeadForm.tsx`, `src/lib/crm.ts` |
| OG score-card generation | `src/app/api/og/route.tsx` |
| Analytics events | `src/lib/analytics.ts`, `src/app/api/analytics` |
| PDPL/GDPR data deletion | `src/app/api/data-deletion`, `/careers/play/privacy` |
| Data layer (Supabase + in-memory fallback) | `src/lib/store/` |

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000  → redirects to /careers/play
```

That's it. **With no environment variables set, the hub runs against an
in-memory store** so you can play, save scores and see the leaderboard locally.
(Data resets on restart — use Supabase for persistence, see below.)

```bash
npm run build && npm run start   # production build
npm run typecheck                # tsc --noEmit
```

### Tech stack

- **Client:** TypeScript + React (Next.js 14 App Router). The flagship game is
  rendered on a plain **Canvas** (no engine dependency) to keep the bundle tiny
  and load in < 3s on 4G — first-load JS for `/careers/play` is ~95 kB. The shell
  is deliberately lightweight so more game modules drop in later.
- **Backend:** Next.js serverless route handlers (`src/app/api/*`).
- **DB:** Supabase (managed Postgres) with a zero-config in-memory fallback.

---

## Configuration

Copy `.env.example` to `.env.local`. Every value is optional; set what you need.

| Variable | Purpose |
| --- | --- |
| `SCORE_SIGNING_SECRET` | **Required in production.** Long random string used to sign anti-cheat play tokens + score receipts (HMAC-SHA256). |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Enable the Supabase store. Set both, or leave blank for the in-memory store. |
| `CRM_WEBHOOK_URL` | Where each saved lead is POSTed (see below). Blank = leads are logged, not forwarded. |
| `CRM_WEBHOOK_TOKEN` | Optional bearer token sent as `Authorization: Bearer …` to the webhook. |
| `NEXT_PUBLIC_SITE_URL` | Public origin for OG cards + share links. Defaults to the request origin. |
| `SEASON_EPOCH` | Seasonal reset key (default `2026-s1`). Bump to start a new season without deleting history. |

### Database setup (Supabase)

Apply the schema in `supabase/schema.sql` via the Supabase SQL editor or
`supabase db push`. It creates `scores`, `leads` and `analytics_events`, all
keyed by a `game` string, with RLS enabled (server-only access via the service
role key). A PII-free `leaderboard_public` view is included for optional
anon-key reads.

### CRM webhook contract

When a lead is saved, `POST {CRM_WEBHOOK_URL}` receives JSON:

```jsonc
{
  "source": "betterhomes-careers-play",
  "campaign": "trust-better-get-better",
  "name": "Aisha Rahman",
  "email": "aisha@example.com",      // present if provided
  "whatsapp": "+9715…",              // present if provided
  "segment": "experienced",          // new | returning | experienced | relocating
  "sourceCode": "PUZZLE42",          // from ?code= (links physical puzzles to a profile)
  "office": "Dubai Marina",          // optional
  "game": "break-the-ceiling",
  "score": 420, "height": 420, "tier": "lead",
  "consent": true,
  "capturedAt": "2026-06-30T11:09:39.975Z"
}
```

Delivery is best-effort and time-boxed (5s) — a CRM outage never blocks the
score from being saved. Point `CRM_WEBHOOK_URL` at HubSpot/Salesforce/Zapier/a
custom endpoint.

---

## Anti-cheat (scores are never trusted from the client)

Three server-side layers in `src/lib/anticheat.ts`:

1. **Signed play token** — `POST /api/session` issues an HMAC-signed,
   single-use, time-boxed token at play start. A score can't be submitted
   without one, and a token can't be replayed.
2. **Score normalisation** — `POST /api/score` re-checks the reported height
   against physical limits: a max climb rate per second, and the rule that the
   claimed run duration can't exceed how long the token has actually existed.
   Impossible scores are rejected (HTTP 422).
3. **Rate limiting** — token-bucket per client IP on every write route.

Only after `/api/score` validates a run does it return a **signed receipt**;
`/api/lead` requires that receipt to write to a board. So the leaderboard only
ever stores server-verified scores.

> Note: the in-memory nonce store + rate limiter are per-instance. For
> multi-instance serverless, back them with Redis/Upstash (swap the maps in
> `anticheat.ts`).

---

## Leaderboards

`GET /api/leaderboard?game=…&scope=…[&office=…]`

- **global** — all-time, current season.
- **weekly** — partitioned by the Monday-00:00-**GST** week key
  (`src/lib/leaderboard.ts`); auto-resets with no scheduled job. The response
  includes `resetsInMs` for the live countdown.
- **office** — office-vs-office; pass `&office=`.

Head-to-head challenge links: `/careers/play?challenge=<height>&by=<name>` loads
the game with a target score to beat. The share page generates these.

---

## Sharing & OG cards

`GET /api/og?h=<height>&name=<name>` renders a branded 1200×630 score card
server-side (career tier + height). The share landing page
`/careers/play/share?h=&name=&code=` carries the OG meta tags so a shared link
previews the player's run, with a "Beat _N_ m" button into the challenge.

---

## Analytics

`src/lib/analytics.ts` emits (via `sendBeacon`) to `POST /api/analytics`:
`play_start`, `play_end`, `score_saved`, `lead_captured`, `share_clicked`.
Every event is tagged with the audience **segment** (persisted for returning
players) for funnel analysis. Swap the sink in `src/app/api/analytics/route.ts`
to forward to GA4/Segment/etc.

---

## Privacy (PDPL/GDPR)

- Storage is consent-based: the lead form has an explicit consent checkbox and
  won't submit without it (also enforced server-side).
- Self-service deletion at `/careers/play/privacy` → `POST /api/data-deletion`
  hard-deletes a lead by email or WhatsApp.

---

## Adding the next game module

The leaderboard and capture services are game-agnostic — they key everything on
a `game` string. **Adding a second game requires no change to those services.**

1. **Implement the contract** in `src/game/engine/types.ts`:

   ```ts
   // src/game/modules/castForTheCatch/game.ts
   import type { GameModule } from "@/game/engine/types";

   export const castForTheCatch: GameModule = {
     id: "cast-for-the-catch",
     title: "Cast for the catch",
     tagline: "Time the cast. Land the deal.",
     create(ctx) {
       // ctx gives you: canvas, width, height, devicePixelRatio,
       // targetScore (challenge), onScore(height), onGameOver({height, durationMs}).
       return { start() {/*…*/}, pause() {/*…*/}, resume() {/*…*/}, destroy() {/*…*/} };
     },
   };
   ```

2. **Register it** in `src/game/registry.ts`:

   ```ts
   export const GAMES: GameModule[] = [breakTheCeiling, castForTheCatch];
   ```

3. **Add an anti-cheat ruleset** for its `id` in
   `src/lib/anticheat.ts → GAME_RULES` (max rate per second, min time for score,
   absolute cap). This is the only backend touch-point, and it's per-game tuning,
   not a service change.

4. (Optional) tailor career tiers per game; the flagship's tiers live in
   `src/lib/tiers.ts`.

That's the whole checklist. The hub shell, `/api/score`, `/api/lead`,
`/api/leaderboard`, `/api/og`, analytics and the CRM webhook all work for the
new game immediately. Planned modules: **Cast for the catch**, **The puzzle**,
**Trust better diagnostic**.

---

## Project map

```
src/
  app/
    careers/play/            hub shell, share landing, privacy
    api/                     session, score, leaderboard, lead, offices,
                             analytics, og, data-deletion
  game/
    engine/types.ts          GameModule / GameInstance contract
    GameHost.tsx             mounts a module on a responsive canvas
    registry.ts              register games here
    modules/breakTheCeiling/ the flagship game
  components/                Hub, Leaderboard, LeadForm, ShareRow, …
  lib/
    anticheat.ts  crm.ts  analytics.ts  leaderboard.ts  tiers.ts
    brand.ts  segments.ts  offices.ts  config.ts
    store/                   Store interface + memory + supabase impls
supabase/schema.sql          Postgres schema + RLS
```

---

## Acceptance criteria — status

- ✅ A new player can play, score, opt in, and appear on the weekly leaderboard
  on a phone in under 60 seconds.
- ✅ A saved score produces a CRM lead with the correct segment tag and source
  code.
- ✅ Client-tampered scores are rejected server-side.
- ✅ Adding a second game requires no change to the leaderboard or capture
  services.
