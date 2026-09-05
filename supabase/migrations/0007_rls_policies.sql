-- Who can read what.
--
-- Clients get SELECT on their own rows and nothing else. Every mutation goes through a
-- server action that resolves entitlements first, so max_targets and the cadence floor are
-- enforced in exactly one place instead of being restated as SQL that can drift. If a
-- public write API ever ships, the limits move into a trigger too.
--
-- auth.uid() is wrapped in a scalar subquery throughout: Postgres then evaluates it once per
-- statement rather than once per row, which matters on ping_log.
--
-- service_role bypasses all of this, so the engine is unaffected.

alter table profiles           enable row level security;
alter table projects           enable row level security;
alter table plans              enable row level security;
alter table subscriptions      enable row level security;
alter table events             enable row level security;
alter table github_credentials enable row level security;

create policy "read own profile" on profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "update own profile" on profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read own projects" on projects
  for select to authenticated using (user_id = (select auth.uid()));

-- Targets belong to a user through their project. Rows with a null project_id are the
-- engine's own unowned targets and match nobody.
create policy "read own targets" on targets
  for select to authenticated using (
    project_id in (select id from projects where user_id = (select auth.uid()))
  );

create policy "read own ping history" on ping_log
  for select to authenticated using (
    target_id in (
      select t.id from targets t
      join projects p on p.id = t.project_id
      where p.user_id = (select auth.uid())
    )
  );

create policy "read own pause events" on pause_events
  for select to authenticated using (
    target_id in (
      select t.id from targets t
      join projects p on p.id = t.project_id
      where p.user_id = (select auth.uid())
    )
  );

-- Plans are public config; a signed-in user may read every tier to see what an upgrade buys.
create policy "read plans" on plans
  for select to authenticated using (true);

create policy "read own subscription" on subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- jobs, events and github_credentials get no policies at all. jobs is the scheduler's hot
-- path and no client has business reading it; events is write-only analytics; and
-- github_credentials holds a live GitHub token that only service_role may ever touch.
