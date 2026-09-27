-- Opt-in auto-restore for Supabase backends. A user who turns it on leaves us a Supabase
-- OAuth refresh token, kept in Vault (encrypted at rest) and reachable only through the
-- service-only functions below. The restorer asks Supabase whether a failing project is
-- paused before restoring it.

alter table targets add column auto_restore boolean not null default false;

create table supabase_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table supabase_grants enable row level security;

create function store_supabase_grant(p_user uuid, p_refresh text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
  select secret_id into sid from supabase_grants where user_id = p_user;
  if sid is null then
    sid := vault.create_secret(p_refresh, 'supabase_grant_' || p_user::text);
    insert into supabase_grants (user_id, secret_id) values (p_user, sid);
  else
    perform vault.update_secret(sid, p_refresh);
    update supabase_grants set updated_at = now() where user_id = p_user;
  end if;
end $$;

create function read_supabase_grant(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  join supabase_grants g on g.secret_id = s.id where g.user_id = p_user;
$$;

-- Forgets the token and switches auto-restore off on every backend it served.
create function drop_supabase_grant(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from vault.secrets where id = (select secret_id from supabase_grants where user_id = p_user);
  delete from supabase_grants where user_id = p_user;
  update targets set auto_restore = false
  where project_id in (select id from projects where user_id = p_user);
end $$;

-- Opted-in Supabase backends whose latest check failed, with where to tell the owner.
create function restore_candidates()
returns table (target_id uuid, user_id uuid, url text, project_name text,
               webhook_kind text, webhook_url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, p.user_id, t.url, p.name, c.kind, c.webhook_url
  from targets t
  join projects p on p.id = t.project_id
  join supabase_grants g on g.user_id = p.user_id
  join target_health h on h.target_id = t.id
  left join notification_channels c on c.user_id = p.user_id and c.alerts
  where t.auto_restore and t.enabled and t.platform = 'supabase'
    and h.last_ping_at is not null
    and (h.last_ok_at is null or h.last_ok_at < h.last_ping_at);
$$;

revoke all on function store_supabase_grant(uuid, text), read_supabase_grant(uuid),
  drop_supabase_grant(uuid), restore_candidates() from public, anon, authenticated;
grant execute on function store_supabase_grant(uuid, text), read_supabase_grant(uuid),
  drop_supabase_grant(uuid), restore_candidates() to service_role;

-- Every 30 minutes. A no-op until the restorer_url secret exists.
select cron.schedule('restorer', '*/30 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'restorer_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sleeve-cron',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'restorer_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
$$);
