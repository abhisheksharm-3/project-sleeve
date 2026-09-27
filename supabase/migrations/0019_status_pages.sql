-- Customisable public status pages: a page picks any of its owner's backends, labels them,
-- and carries owner-written notices. Owners read their own rows through RLS; every write
-- and every public read goes through the service role.

create table status_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 280),
  published boolean not null default false,
  show_uptime boolean not null default true,
  show_response_time boolean not null default true,
  show_outages boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index status_pages_user_idx on status_pages (user_id);

create table status_page_items (
  page_id uuid not null references status_pages(id) on delete cascade,
  target_id uuid not null references targets(id) on delete cascade,
  label text check (char_length(label) <= 60),
  position int not null,
  primary key (page_id, target_id)
);

create table status_page_notices (
  id bigint generated always as identity primary key,
  page_id uuid not null references status_pages(id) on delete cascade,
  kind text not null check (kind in ('incident', 'maintenance', 'notice')),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index status_page_notices_page_idx on status_page_notices (page_id, created_at desc);

alter table status_pages enable row level security;
alter table status_page_items enable row level security;
alter table status_page_notices enable row level security;

create policy "read own status pages" on status_pages
  for select to authenticated using (user_id = auth.uid());
create policy "read own status page items" on status_page_items
  for select to authenticated
  using (exists (select 1 from status_pages p where p.id = page_id and p.user_id = auth.uid()));
create policy "read own status page notices" on status_page_notices
  for select to authenticated
  using (exists (select 1 from status_pages p where p.id = page_id and p.user_id = auth.uid()));

-- Daily checks and mean latency per backend, oldest first, for the uptime bars and the
-- response-time line. UTC days.
create function backend_daily(p_targets uuid[], p_days int)
returns table (target_id uuid, day date, pings int, ok int, avg_latency_ms int)
language sql stable as $$
  select l.target_id, (l.ran_at at time zone 'utc')::date, count(*)::int,
         count(*) filter (where l.ok)::int,
         round(avg(l.latency_ms) filter (where l.ok))::int
  from ping_log l
  where l.target_id = any (p_targets) and l.ran_at > now() - make_interval(days => p_days)
  group by 1, 2
  order by 1, 2;
$$;

-- Outages: each run of consecutive failed checks, from its first failure to the next
-- success (null while it is still going on).
create function backend_outages(p_targets uuid[], p_since timestamptz)
returns table (target_id uuid, started_at timestamptz, ended_at timestamptz, failures int)
language sql stable as $$
  with marked as (
    select l.target_id, l.ran_at, l.ok,
           count(*) filter (where l.ok) over (partition by l.target_id order by l.ran_at) as run
    from ping_log l
    where l.target_id = any (p_targets) and l.ran_at > p_since
  ), runs as (
    select target_id, run, min(ran_at) filter (where not ok) as started_at,
           count(*) filter (where not ok)::int as failures
    from marked group by target_id, run
  )
  select r.target_id, r.started_at,
         (select min(m.ran_at) from marked m
            where m.target_id = r.target_id and m.ok and m.ran_at > r.started_at),
         r.failures
  from runs r
  where r.failures > 0
  order by r.started_at desc;
$$;

revoke execute on function backend_daily(uuid[], int), backend_outages(uuid[], timestamptz)
  from public, anon, authenticated;
grant execute on function backend_daily(uuid[], int), backend_outages(uuid[], timestamptz)
  to service_role;

-- Mean latency on the dashboard: appended, so the view's existing columns keep their order.
create or replace view target_health with (security_invoker = true) as
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
  s.last_ok_at + make_interval(secs => coalesce(t.pause_window_seconds, w.pause_window_seconds)) as pause_at,
  s.latency_7d
from targets t
left join platform_pause_windows w on w.platform = t.platform
left join lateral (
  select
    max(l.ran_at) as last_ping_at,
    max(l.ran_at) filter (where l.ok) as last_ok_at,
    count(*) filter (where l.ran_at > now() - interval '7 days')::int as pings_7d,
    count(*) filter (where l.ran_at > now() - interval '7 days' and l.ok)::int as ok_7d,
    round(avg(l.latency_ms) filter (where l.ok and l.ran_at > now() - interval '7 days'))::int as latency_7d
  from ping_log l
  where l.target_id = t.id and l.ran_at > now() - interval '30 days'
) s on true;
