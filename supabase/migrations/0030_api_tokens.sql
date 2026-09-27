-- Personal API tokens for scripts and CI. Only a SHA-256 of the token is stored; the token
-- itself is shown once. Owners read their own rows, never the hash, through the columns the
-- app selects; writes go through the service role.
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index api_tokens_user_idx on api_tokens (user_id);
alter table api_tokens enable row level security;
create policy "read own api tokens" on api_tokens
  for select to authenticated using (user_id = (select auth.uid()));
revoke select (token_hash) on api_tokens from authenticated;
