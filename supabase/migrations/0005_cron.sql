-- The heartbeat of the whole engine: one dispatch a minute, one reaper every five.
--
-- pg_cron does the cheap part (claim and invoke) and pg_net fires the request without
-- blocking the cron worker; the HTTP work happens in the Edge Function, which can run
-- fifty pings in parallel.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Set once per environment. Vault rather than `alter database ... set`, because the
-- postgres role on a Supabase project is not superuser and cannot set custom GUCs, and
-- because the cron secret should be encrypted at rest rather than sitting in
-- pg_db_role_setting in the clear:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/pinger', 'pinger_url');
--   select vault.create_secret('<SLEEVE_CRON_SECRET>', 'cron_secret');
-- Until both exist the dispatch is a deliberate no-op rather than a minutely error.
select cron.schedule('pinger-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'pinger_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sleeve-cron',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    -- pg_net defaults to 5s, which a full batch of 15s-deadline pings would outlive.
    -- Stays under the next tick so a slow cycle cannot pile up behind itself.
    timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'pinger_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
$$);

-- Recovers jobs orphaned by a function run that died mid-cycle.
select cron.schedule('reaper', '*/5 * * * *', $$ select reap_stuck_jobs(300); $$);
