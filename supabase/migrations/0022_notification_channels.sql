-- Where a user's alerts and weekly digest go: one Discord or Slack incoming webhook. Owners
-- read their own row; the app writes through the service role after validating the URL
-- against the two providers' hosts.
create table notification_channels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('discord', 'slack')),
  webhook_url text not null check (
    webhook_url ~ '^https://(discord\.com|discordapp\.com)/api/webhooks/'
    or webhook_url ~ '^https://hooks\.slack\.com/services/'
  ),
  alerts boolean not null default true,
  digest boolean not null default true,
  last_digest_at timestamptz,
  created_at timestamptz not null default now()
);
alter table notification_channels enable row level security;
create policy "read own notification channel" on notification_channels
  for select to authenticated using (user_id = (select auth.uid()));

-- Alerts now reach a webhook as well as email, so an owner with no email still gets them.
drop function if exists pending_alerts();
create function pending_alerts()
returns table (alert_id bigint, kind text, email text, webhook_kind text, webhook_url text,
               project_name text, url text, platform platform, last_ok_at timestamptz,
               pause_at timestamptz, failures int)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.kind, u.email::text, c.kind, c.webhook_url, p.name, t.url, t.platform,
         h.last_ok_at, h.pause_at, h.failures_since_ok
  from alerts a
  join targets t on t.id = a.target_id
  join projects p on p.id = t.project_id
  join auth.users u on u.id = p.user_id
  join target_health h on h.target_id = t.id
  left join notification_channels c on c.user_id = p.user_id and c.alerts
  where a.resolved_at is null and a.notified_at is null
    and (u.email is not null or c.webhook_url is not null)
  order by a.opened_at;
$$;
revoke all on function pending_alerts() from public, anon, authenticated;
grant execute on function pending_alerts() to service_role;

-- Mondays at 08:00 UTC. A no-op until the digest_url secret exists.
select cron.schedule('digest', '0 8 * * 1', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'digest_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sleeve-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'digest_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
$$);
