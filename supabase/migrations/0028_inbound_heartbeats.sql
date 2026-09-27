-- Inbound heartbeats are never pinged, so they get no job. The ping URL's token is the
-- target's secret, looked up by index.
create or replace function sync_target_job() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.enabled and new.heartbeat_type <> 'inbound' then
    insert into jobs (target_id, next_run_at, min_interval_seconds)
    values (new.id, now(), new.interval_seconds)
    on conflict (target_id) do update
      set min_interval_seconds = excluded.min_interval_seconds;
  else
    delete from jobs where target_id = new.id;
  end if;
  return new;
end;
$$;

create unique index if not exists targets_inbound_token_idx on targets (secret)
  where heartbeat_type = 'inbound';

-- Records one failed check for each heartbeat whose expected ping is late: the expected
-- period plus a grace of a tenth of it, never under five minutes. Measured from the last
-- recorded row, a silent job gets one missed row per period, not one per run.
create or replace function mark_missed_heartbeats() returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with late as (
    insert into ping_log (target_id, ok, error)
    select t.id, false, 'heartbeat missed'
    from targets t
    left join lateral (
      select max(l.ran_at) as last_at from ping_log l where l.target_id = t.id
    ) l on true
    where t.enabled and t.heartbeat_type = 'inbound'
      and coalesce(l.last_at, t.created_at)
          < now() - make_interval(secs => t.interval_seconds + greatest(300, t.interval_seconds / 10))
      and not exists (
        select 1 from maintenance_windows w
        where w.target_id = t.id and now() >= w.starts_at and now() < w.ends_at
      )
    returning 1
  )
  select count(*)::int from late;
$$;
revoke all on function mark_missed_heartbeats() from public, anon, authenticated;
grant execute on function mark_missed_heartbeats() to service_role;

select cron.schedule('heartbeat-watch', '*/5 * * * *', $$ select mark_missed_heartbeats(); $$);

-- One missed heartbeat is the news; for pinged backends a single failure is noise.
create or replace view alert_conditions as
select h.target_id, c.kind
from target_health h
join targets t on t.id = h.target_id and t.enabled
join projects p on p.id = t.project_id
join profiles pr on pr.id = p.user_id and pr.alerts_enabled
cross join lateral (values
  ('failing',    h.failures_since_ok >= case when t.heartbeat_type = 'inbound' then 1 else 3 end),
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
