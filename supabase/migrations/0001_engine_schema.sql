-- ProjectSleeve engine schema: targets, jobs, ping_log, pause_events.
-- Data minimization (spec §8): we persist status codes, latency, error *types*, and
-- pause signals only. No response bodies, no user data, no secrets beyond the ping token.

create type platform as enum ('supabase','appwrite','render','railway','custom');
create type heartbeat_type as enum ('plain','db_query','synthetic');
create type job_status as enum ('idle','claimed','running');

create table targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,                       -- FK added in the hub plan
  platform platform not null,
  url text not null,
  method text not null default 'GET',
  heartbeat_type heartbeat_type not null default 'plain',
  interval_seconds int not null check (interval_seconds >= 30),
  enabled boolean not null default true,
  secret text,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null unique references targets(id) on delete cascade,
  next_run_at timestamptz not null default now(),
  status job_status not null default 'idle',
  consecutive_failures int not null default 0,
  last_run_at timestamptz,
  claimed_at timestamptz,
  min_interval_seconds int not null default 30
);

-- hot-path index: the scheduler's only selective query
create index jobs_due_idx on jobs (next_run_at) where status = 'idle';
create index jobs_claimed_idx on jobs (claimed_at) where status = 'claimed';

create table ping_log (
  id bigint generated always as identity primary key,
  target_id uuid not null references targets(id) on delete cascade,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  status_code int,
  latency_ms int,
  error text
);
create index ping_log_target_idx on ping_log (target_id, ran_at desc);

create table pause_events (
  id bigint generated always as identity primary key,
  target_id uuid not null references targets(id) on delete cascade,
  detected_at timestamptz not null default now(),
  platform platform not null,
  signal text not null,
  last_ok_ping_at timestamptz,
  days_since_last_ok numeric
);
create index pause_events_target_idx on pause_events (target_id, detected_at desc);

-- These tables sit in `public`, so PostgREST exposes them to the anon key. Enable RLS with
-- no policies: that denies anon/authenticated outright while `service_role` (the engine and
-- the tests) bypasses RLS. Per-user policies arrive with the hub plan's `users`/`projects`.
alter table targets       enable row level security;
alter table jobs          enable row level security;
alter table ping_log      enable row level security;
alter table pause_events  enable row level security;

-- Test-only: truncate all engine tables in dependency-safe order. `security definer` so it
-- runs as the owner regardless of table grants; pinned search_path so it cannot be hijacked.
-- RLS does not govern function execution, so execute is revoked from every client role.
create or replace function truncate_engine_tables() returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  truncate pause_events, ping_log, jobs, targets restart identity cascade;
$$;

revoke all on function truncate_engine_tables() from public, anon, authenticated;
grant execute on function truncate_engine_tables() to service_role;
