-- Hand out due jobs exactly once, even when two cron ticks overlap.
--
-- FOR UPDATE SKIP LOCKED is the whole trick: concurrent callers step over rows their
-- peers have locked instead of blocking on them, so no target is ever pinged twice in
-- one cycle. The claim and the status flip are one statement, so there is no window in
-- which a job is selected but not yet marked.
create or replace function claim_due_jobs(batch_size int default 50)
returns table (
  job_id uuid, target_id uuid, url text, method text,
  heartbeat_type heartbeat_type, secret text, platform platform
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
  -- one join, not a correlated subquery per column: this runs every minute
  select c.id, c.target_id, t.url, t.method, t.heartbeat_type, t.secret, t.platform
  from claimed c
  join targets t on t.id = c.target_id;
end;
$$;

-- create function grants execute to public by default, and RLS does not govern
-- functions. Only the engine's service_role may move jobs through the queue.
revoke all on function claim_due_jobs(int) from public, anon, authenticated;
grant execute on function claim_due_jobs(int) to service_role;
