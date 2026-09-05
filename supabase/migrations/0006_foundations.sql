-- Phase 0 foundations: who a user is, what they own, and what they are entitled to.
--
-- The engine tables shipped in 0001 with RLS enabled and no policies, which denied every
-- client outright while service_role bypassed it. That was correct with no users. Now that
-- projects exist, ownership becomes expressible, so the policies land here.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  github_username text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  repo_url text,
  github_id bigint,
  language text,
  last_commit_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  -- re-importing a repo updates its project instead of creating a second one
  unique (user_id, github_id)
);
create index projects_user_idx on projects (user_id) where not archived;

-- The FK Phase 1 deliberately left off. Nullable, so the engine's existing unowned test
-- targets keep running; every target created through the app carries a project.
alter table targets
  add constraint targets_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;
create index targets_project_idx on targets (project_id);

-- Plans are data, not code: a new tier is an insert, never a branch in feature code (spec §9).
create table plans (
  id text primary key,
  name text not null,
  limits jsonb not null
);

-- min_interval_seconds is 6h because Supabase pauses after roughly 7 days; anything faster
-- buys no safety and costs us request volume. max_targets is per user, not per project.
insert into plans (id, name, limits) values (
  'free',
  'Free',
  '{"max_projects": 5, "max_targets": 3, "min_interval_seconds": 21600,
    "heartbeat_types": ["plain", "db_query"], "channels": ["email"]}'::jsonb
);

-- The Stripe columns exist and sit null. Adding Stripe writes these same columns and flips
-- source to 'stripe' — one webhook file, no migration, no feature-code change.
create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references plans(id),
  status text not null default 'active' check (status in ('active','past_due','canceled')),
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  source text not null default 'manual' check (source in ('manual','stripe')),
  created_at timestamptz not null default now()
);

-- Tier 2 product analytics (spec §8): the activation funnel, append-only.
create table events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index events_user_idx on events (user_id, occurred_at desc);

-- The GitHub provider token, needed to list repos. Supabase does not persist provider_token
-- across sessions, so we capture it at the OAuth callback and keep it here. RLS is enabled
-- with no policies on purpose: no client role may ever read this table, only service_role.
create table github_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  updated_at timestamptz not null default now()
);

-- A new GitHub sign-in gets a profile and a free subscription in the same transaction, so
-- no code path has to cope with a user who has one but not the other.
create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, github_username, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into subscriptions (user_id, plan_id, status, source)
  values (new.id, 'free', 'active', 'manual')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
