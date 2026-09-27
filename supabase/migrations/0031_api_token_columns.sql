-- A column revoke is a no-op while the table-wide grant stands, so owners get an explicit
-- column list instead, and the hash stays readable to the service role alone.
revoke select on api_tokens from anon, authenticated;
grant select (id, user_id, name, prefix, created_at, last_used_at) on api_tokens to authenticated;
