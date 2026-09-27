-- Alerts run on their own clock, every 15 minutes, well away from the minute-by-minute ping
-- path. Set once per environment:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/alerter', 'alerter_url');
-- The cron secret is the same one the pinger uses. Until alerter_url exists this is a no-op.
select cron.schedule('alerter', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'alerter_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sleeve-cron',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'alerter_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
$$);
