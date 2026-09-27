-- Shared projects. A member can see a project, its backends and their history, gets its
-- alerts and digest, and can run a check or put a backend into maintenance. Only the owner
-- changes what is kept awake, shares it, or invites people. The next migration stops anyone
-- reading a backend's secret through the API, once the app no longer asks for it.

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);

-- Single-use invite links, valid for a week. Only a SHA-256 of the link's token is kept.
create table project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

alter table project_members enable row level security;
alter table project_invites enable row level security;

-- Security definer so policies can call it without recursing through projects' own RLS.
create function can_read_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from projects where id = p_project and user_id = (select auth.uid()))
      or exists (select 1 from project_members where project_id = p_project and user_id = (select auth.uid()));
$$;
revoke all on function can_read_project(uuid) from public, anon;
grant execute on function can_read_project(uuid) to authenticated, service_role;

create policy "read members of readable projects" on project_members
  for select to authenticated using (can_read_project(project_id));
create policy "owners read their invites" on project_invites
  for select to authenticated using (
    exists (select 1 from projects where id = project_id and user_id = (select auth.uid()))
  );
revoke select on project_invites from authenticated;
grant select (id, project_id, created_by, expires_at, created_at) on project_invites to authenticated;

drop policy "read own projects" on projects;
create policy "read own and shared projects" on projects
  for select to authenticated using (can_read_project(id));

drop policy "read own targets" on targets;
create policy "read targets of readable projects" on targets
  for select to authenticated using (project_id is not null and can_read_project(project_id));

drop policy "read own ping history" on ping_log;
create policy "read ping history of readable projects" on ping_log
  for select to authenticated using (
    exists (select 1 from targets t where t.id = target_id and can_read_project(t.project_id))
  );

drop policy "read own pause events" on pause_events;
create policy "read pause events of readable projects" on pause_events
  for select to authenticated using (
    exists (select 1 from targets t where t.id = target_id and can_read_project(t.project_id))
  );

drop policy "read own maintenance windows" on maintenance_windows;
create policy "read maintenance of readable projects" on maintenance_windows
  for select to authenticated using (
    exists (select 1 from targets t where t.id = target_id and can_read_project(t.project_id))
  );

-- Alerts reach the owner and every member: one row per alert and person.
drop function if exists pending_alerts();
create function pending_alerts()
returns table (alert_id bigint, kind text, email text, webhook_kind text, webhook_url text,
               project_name text, url text, platform platform, last_ok_at timestamptz,
               pause_at timestamptz, failures int)
language sql
security definer
set search_path = public, pg_temp
as $$
  with people as (
    select p.id as project_id, p.user_id from projects p
    union
    select m.project_id, m.user_id from project_members m
  )
  select a.id, a.kind, case when pr.alerts_enabled then u.email::text end, c.kind,
         c.webhook_url, p.name, t.url, t.platform, h.last_ok_at, h.pause_at, h.failures_since_ok
  from alerts a
  join targets t on t.id = a.target_id
  join projects p on p.id = t.project_id
  join people pe on pe.project_id = p.id
  join auth.users u on u.id = pe.user_id
  join profiles pr on pr.id = pe.user_id
  join target_health h on h.target_id = t.id
  left join notification_channels c on c.user_id = pe.user_id and c.alerts
  where a.resolved_at is null and a.notified_at is null
    and ((pr.alerts_enabled and u.email is not null) or c.webhook_url is not null)
  order by a.opened_at;
$$;
revoke all on function pending_alerts() from public, anon, authenticated;
grant execute on function pending_alerts() to service_role;
