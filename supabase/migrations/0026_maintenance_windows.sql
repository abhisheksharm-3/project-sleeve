-- Maintenance windows: a stretch during which a backend's alerts are held and its status
-- reads as planned maintenance. Checks keep running, so a long window can never let the
-- platform pause the project. Kept as rows, so past windows stay in status-page history.
create table maintenance_windows (
  id bigint generated always as identity primary key,
  target_id uuid not null references targets(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '30 days')
);
create index maintenance_windows_target_idx on maintenance_windows (target_id, ends_at desc);
alter table maintenance_windows enable row level security;
create policy "read own maintenance windows" on maintenance_windows
  for select to authenticated
  using (exists (
    select 1 from targets t join projects p on p.id = t.project_id
    where t.id = target_id and p.user_id = (select auth.uid())
  ));

-- A backend in maintenance raises no alert; one still broken after it ends raises a new one.
create or replace view alert_conditions as
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
where c.holds
  and not exists (
    select 1 from maintenance_windows w
    where w.target_id = h.target_id and now() >= w.starts_at and now() < w.ends_at
  );
revoke all on alert_conditions from public, anon, authenticated;

-- Outages that began inside a maintenance window were planned, not outages.
create or replace function backend_outages(p_targets uuid[], p_since timestamptz)
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
    and not exists (
      select 1 from maintenance_windows w
      where w.target_id = r.target_id and r.started_at >= w.starts_at and r.started_at < w.ends_at
    )
  order by r.started_at desc;
$$;
revoke execute on function backend_outages(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function backend_outages(uuid[], timestamptz) to service_role;
