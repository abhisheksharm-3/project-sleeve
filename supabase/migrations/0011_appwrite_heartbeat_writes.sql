-- Appwrite's free-plan inactivity check ignores reads and every other API call, so its
-- heartbeat is a write: an upsert of one row in a table the user creates for us.
alter type heartbeat_type add value if not exists 'db_write';

-- The platform's own identifier for the target when the URL alone does not carry it:
-- for Appwrite, the project id sent as X-Appwrite-Project.
alter table targets add column if not exists platform_ref text;

-- Return type changes, so the function is replaced rather than altered.
drop function if exists claim_due_jobs(int);

create function claim_due_jobs(batch_size int default 50)
returns table (
  job_id uuid, target_id uuid, url text, method text,
  heartbeat_type heartbeat_type, secret text, platform platform, platform_ref text
)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select j.id
    from jobs j
    where j.status = 'idle' and j.next_run_at <= now()
    order by j.next_run_at
    limit batch_size
    for update skip locked
  ),
  claimed as (
    update jobs j
    set status = 'claimed', claimed_at = now()
    from due
    where j.id = due.id
    returning j.id, j.target_id
  )
  select c.id, c.target_id, t.url, t.method, t.heartbeat_type, t.secret, t.platform, t.platform_ref
  from claimed c
  join targets t on t.id = c.target_id;
end;
$$;

revoke all on function claim_due_jobs(int) from public, anon, authenticated;
grant execute on function claim_due_jobs(int) to service_role;
