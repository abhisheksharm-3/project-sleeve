-- Exactly one job per enabled target, maintained by the database rather than app code,
-- so a target can never end up enabled with nothing scheduling it.
--
-- On a config edit the upsert touches min_interval_seconds only: next_run_at and
-- consecutive_failures survive, so changing a cadence neither skips the next ping nor
-- wipes the failure streak that monitoring reads.
--
-- min_interval_seconds mirrors interval_seconds for now. This is the seam where the hub
-- plan will clamp it to entitlements(user).minInterval() instead.
create or replace function sync_target_job() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.enabled then
    insert into jobs (target_id, next_run_at, min_interval_seconds)
    values (new.id, now(), new.interval_seconds)
    on conflict (target_id) do update
      set min_interval_seconds = excluded.min_interval_seconds;
  else
    delete from jobs where target_id = new.id;
  end if;
  return new;
end;
$$;

create trigger target_job_sync
after insert or update of enabled, interval_seconds on targets
for each row execute function sync_target_job();
