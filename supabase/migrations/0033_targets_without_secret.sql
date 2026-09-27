-- Targets become readable column by column, every column but the secret, so a member of a
-- shared project can never read a backend's key or password. New columns on targets must
-- be added to this grant to be readable at all.
revoke select on targets from anon, authenticated;
grant select (id, project_id, platform, url, method, heartbeat_type, interval_seconds, enabled,
              created_at, platform_ref, pause_window_seconds, auto_restore, label)
  on targets to authenticated;
