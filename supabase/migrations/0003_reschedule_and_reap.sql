-- Close out a ping and put the job back in the queue.
--
-- The cadence comes from jobs.min_interval_seconds, copied onto the row at config time,
-- so the every-minute path never joins to plans or subscriptions (spec §5, §9).
-- Jitter spreads a fleet of same-interval targets so they do not all fire on the minute.
create or replace function reschedule_job(
  p_job_id uuid, p_ok boolean, p_jitter_seconds int default 0
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update jobs
  set status = 'idle',
      claimed_at = null,
      last_run_at = now(),
      consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
      next_run_at = now()
        + make_interval(secs => min_interval_seconds)
        + make_interval(secs => floor(random() * greatest(p_jitter_seconds, 0))::int)
  where id = p_job_id;
end;
$$;

-- Self-healing: a function run that died mid-cycle leaves its jobs stranded in 'claimed'.
-- Reset them to 'idle' with next_run_at untouched (still in the past), so the next tick
-- picks them straight back up.
create or replace function reap_stuck_jobs(p_max_claim_age_seconds int default 300)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare reaped int;
begin
  with stuck as (
    update jobs
    set status = 'idle', claimed_at = null
    where status in ('claimed','running')
      and claimed_at is not null
      and claimed_at < now() - make_interval(secs => p_max_claim_age_seconds)
    returning 1
  )
  select count(*) into reaped from stuck;
  return reaped;
end;
$$;

revoke all on function reschedule_job(uuid, boolean, int) from public, anon, authenticated;
revoke all on function reap_stuck_jobs(int) from public, anon, authenticated;
grant execute on function reschedule_job(uuid, boolean, int) to service_role;
grant execute on function reap_stuck_jobs(int) to service_role;
