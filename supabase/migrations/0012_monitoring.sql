-- Phase 3: how healthy each target is, how long until its platform would pause it, and
-- which of those facts a user has been told about. Nothing here touches the ping path.

-- How long a platform tolerates silence before it pauses a free project. Data, not code,
-- so windows can be tuned from observed pause_events (spec §8, Tier 1).
create table platform_pause_windows (
  platform platform primary key,
  pause_window_seconds int not null check (pause_window_seconds > 0)
);
insert into platform_pause_windows values
  ('supabase', 604800),
  ('appwrite', 604800),
  ('render',   900);

-- A per-target window where it varies per target: a Hugging Face Space's own gcTimeout.
alter table targets add column if not exists pause_window_seconds int
  check (pause_window_seconds is null or pause_window_seconds > 0);

-- Lets a user turn alert email off without touching anything else.
alter table profiles add column if not exists alerts_enabled boolean not null default true;

alter table platform_pause_windows enable row level security;
create policy "read pause windows" on platform_pause_windows for select to authenticated using (true);

-- security_invoker: the view runs with the caller's rights, so ping_log's RLS still decides
-- which rows a user sees. Only the last 30 days are scanned; a target with no good ping in
-- that long is past every window we track.
create view target_health with (security_invoker = true) as
select
  t.id as target_id,
  t.project_id,
  coalesce(t.pause_window_seconds, w.pause_window_seconds) as pause_window_seconds,
  s.last_ping_at,
  s.last_ok_at,
  (select count(*) from ping_log f
     where f.target_id = t.id and not f.ok
       and f.ran_at > coalesce(s.last_ok_at, now() - interval '30 days'))::int as failures_since_ok,
  s.pings_7d,
  case when s.pings_7d > 0 then round(100.0 * s.ok_7d / s.pings_7d, 1) end as uptime_7d,
  s.last_ok_at + make_interval(secs => coalesce(t.pause_window_seconds, w.pause_window_seconds)) as pause_at
from targets t
left join platform_pause_windows w on w.platform = t.platform
left join lateral (
  select
    max(l.ran_at) as last_ping_at,
    max(l.ran_at) filter (where l.ok) as last_ok_at,
    count(*) filter (where l.ran_at > now() - interval '7 days')::int as pings_7d,
    count(*) filter (where l.ran_at > now() - interval '7 days' and l.ok)::int as ok_7d
  from ping_log l
  where l.target_id = t.id and l.ran_at > now() - interval '30 days'
) s on true;

create view target_daily_uptime with (security_invoker = true) as
select target_id, date_trunc('day', ran_at)::date as day,
       count(*)::int as pings, count(*) filter (where ok)::int as ok
from ping_log
where ran_at > now() - interval '14 days'
group by target_id, date_trunc('day', ran_at);

revoke all on target_health, target_daily_uptime from anon;
grant select on target_health, target_daily_uptime to authenticated;

-- One row per alert episode. The partial unique index is the dedup: a condition that stays
-- true never opens a second alert, and one that clears and recurs opens a fresh one.
create table alerts (
  id bigint generated always as identity primary key,
  target_id uuid not null references targets(id) on delete cascade,
  kind text not null check (kind in ('failing', 'pause_soon', 'paused')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz
);
create unique index alerts_one_open_per_kind on alerts (target_id, kind) where resolved_at is null;
alter table alerts enable row level security;

-- Opens alerts whose condition now holds and resolves those whose condition cleared.
-- Only owned, enabled targets whose owner has alerts on are considered.
create or replace function sync_alerts() returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  create temp table current_conditions on commit drop as
  select h.target_id, c.kind
  from target_health h
  join targets t on t.id = h.target_id and t.enabled
  join projects p on p.id = t.project_id
  join profiles pr on pr.id = p.user_id and pr.alerts_enabled
  cross join lateral (values
    ('failing',    h.failures_since_ok >= 3),
    ('pause_soon', h.pause_window_seconds >= 86400 and h.pause_at > now()
                   and h.pause_at < now() + interval '48 hours'),
    ('paused',     h.pause_at is not null and h.pause_at <= now())
  ) as c(kind, holds)
  where c.holds;

  update alerts a set resolved_at = now()
  where a.resolved_at is null
    and not exists (select 1 from current_conditions c where c.target_id = a.target_id and c.kind = a.kind);

  insert into alerts (target_id, kind)
  select target_id, kind from current_conditions
  on conflict (target_id, kind) where resolved_at is null do nothing;
end;
$$;

-- Open alerts nobody has been emailed about yet, with what the email needs to say.
create or replace function pending_alerts()
returns table (alert_id bigint, kind text, email text, project_name text, url text,
               platform platform, last_ok_at timestamptz, pause_at timestamptz, failures int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.kind, u.email::text, p.name, t.url, t.platform, h.last_ok_at, h.pause_at, h.failures_since_ok
  from alerts a
  join targets t on t.id = a.target_id
  join projects p on p.id = t.project_id
  join auth.users u on u.id = p.user_id
  join target_health h on h.target_id = t.id
  where a.resolved_at is null and a.notified_at is null and u.email is not null
  order by a.opened_at;
$$;

revoke all on function sync_alerts() from public, anon, authenticated;
revoke all on function pending_alerts() from public, anon, authenticated;
grant execute on function sync_alerts() to service_role;
grant execute on function pending_alerts() to service_role;
