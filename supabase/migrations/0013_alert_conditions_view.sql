-- sync_alerts() built its conditions in a temp table, which outlives the call, so a second
-- call in the same transaction failed. The conditions become a view both statements read.
-- It runs with its owner's rights, so every client role is revoked from it.
create view alert_conditions as
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

revoke all on alert_conditions from public, anon, authenticated;

create or replace function sync_alerts() returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update alerts a set resolved_at = now()
  where a.resolved_at is null
    and not exists (select 1 from alert_conditions c where c.target_id = a.target_id and c.kind = a.kind);

  insert into alerts (target_id, kind)
  select target_id, kind from alert_conditions
  on conflict (target_id, kind) where resolved_at is null do nothing;
$$;
