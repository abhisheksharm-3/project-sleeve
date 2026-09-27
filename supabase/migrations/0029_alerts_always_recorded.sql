-- Alerts are recorded for every enabled backend; whether one is delivered is each channel's
-- choice. profiles.alerts_enabled now means "email me" only, and a webhook follows its own
-- alerts setting. Before, a profile with email off never raised an alert at all, so a
-- Discord or Slack webhook stayed silent too.
create or replace view alert_conditions as
select h.target_id, c.kind
from target_health h
join targets t on t.id = h.target_id and t.enabled
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

create or replace function pending_alerts()
returns table (alert_id bigint, kind text, email text, webhook_kind text, webhook_url text,
               project_name text, url text, platform platform, last_ok_at timestamptz,
               pause_at timestamptz, failures int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.kind, case when pr.alerts_enabled then u.email::text end, c.kind,
         c.webhook_url, p.name, t.url, t.platform, h.last_ok_at, h.pause_at, h.failures_since_ok
  from alerts a
  join targets t on t.id = a.target_id
  join projects p on p.id = t.project_id
  join auth.users u on u.id = p.user_id
  join profiles pr on pr.id = p.user_id
  join target_health h on h.target_id = t.id
  left join notification_channels c on c.user_id = p.user_id and c.alerts
  where a.resolved_at is null and a.notified_at is null
    and ((pr.alerts_enabled and u.email is not null) or c.webhook_url is not null)
  order by a.opened_at;
$$;
revoke all on function pending_alerts() from public, anon, authenticated;
grant execute on function pending_alerts() to service_role;
