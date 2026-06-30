-- betterhomes game hub — Supabase / Postgres schema.
-- Apply via the Supabase SQL editor or `supabase db push`.
-- The leaderboard + lead services are game-agnostic: every table is keyed by a
-- `game` string, so a new game module persists with zero schema changes.

-- ── Scores (leaderboard source of truth) ────────────────────────────────────
create table if not exists public.scores (
  id           uuid primary key default gen_random_uuid(),
  game         text        not null,
  display_name text        not null check (char_length(display_name) <= 40),
  height       integer     not null check (height >= 0),
  score        integer     not null check (score >= 0),
  tier         text        not null,
  office       text,
  segment      text,
  week_key     text        not null,            -- Monday-GST partition (weekly board)
  season       text        not null,            -- seasonal epoch
  created_at   timestamptz not null default now()
);

create index if not exists scores_global_idx  on public.scores (game, season, height desc);
create index if not exists scores_weekly_idx  on public.scores (game, season, week_key, height desc);
create index if not exists scores_office_idx  on public.scores (game, season, office, height desc);

-- ── Leads (the recruitment payload) ─────────────────────────────────────────
-- `contact_handle` is a generated column used as the upsert conflict target so
-- the same person (by email, else WhatsApp) is de-duplicated.
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null,
  email          text,
  whatsapp       text,
  contact_handle text generated always as (lower(coalesce(email, whatsapp, ''))) stored,
  segment        text        not null,
  source_code    text,
  office         text,
  game           text        not null,
  best_score     integer     not null default 0,
  consent        boolean     not null default false,
  consent_at     timestamptz,
  created_at     timestamptz not null default now()
);

create unique index if not exists leads_contact_uidx
  on public.leads (contact_handle)
  where contact_handle <> '';

-- ── Analytics events ────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  event       text        not null,
  game        text        not null,
  segment     text,
  score       integer,
  meta        jsonb       not null default '{}'::jsonb,
  client_ts   timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists analytics_event_idx on public.analytics_events (event, received_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- All access goes through the server using the service-role key, which bypasses
-- RLS. We enable RLS with no public policies so the anon key cannot read PII
-- (leads) or write scores directly — anti-cheat is enforced server-side only.
alter table public.scores            enable row level security;
alter table public.leads             enable row level security;
alter table public.analytics_events  enable row level security;

-- Optional: expose a read-only, PII-free leaderboard view to the anon role.
create or replace view public.leaderboard_public as
  select game, display_name, height, tier, office, week_key, season, created_at
  from public.scores;
