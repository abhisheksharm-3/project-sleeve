-- GitHub App installations a user has attached, for private repositories. The id alone is
-- enough to mint tokens with the app's key, so this table is service_role only: RLS on, no
-- policies.
create table if not exists github_installations (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, installation_id)
);
alter table github_installations enable row level security;
