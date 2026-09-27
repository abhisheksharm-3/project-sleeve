-- Atlas pauses a free cluster after 30 days without a connection; Koyeb's free instance
-- sleeps after an hour without HTTP traffic. Koyeb is checked every 30 minutes, inside
-- that hour even when a check runs late.
insert into platform_pause_windows values ('mongodb', 2592000), ('koyeb', 3600)
on conflict (platform) do update set pause_window_seconds = excluded.pause_window_seconds;

update plans
set limits = jsonb_set(
  limits,
  '{platform_min_interval_seconds}',
  coalesce(limits->'platform_min_interval_seconds', '{}'::jsonb) || '{"koyeb": 1800}'::jsonb
);
