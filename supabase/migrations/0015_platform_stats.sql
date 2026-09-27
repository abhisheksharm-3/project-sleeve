-- Tier 3 (spec §8): what the ping history already says about each platform. Aggregated
-- across every user, so it is service_role only and never reaches a client role.
--
-- earliest_pause_days is the tuning signal: the shortest silence after which a platform was
-- actually seen paused. Once it is known, platform_pause_windows can be set from data
-- instead of from documentation.
create or replace function platform_stats(p_days int default 30)
returns table (
  platform platform,
  targets int,
  pings int,
  ok_rate numeric,
  p50_ms int,
  p95_ms int,
  timeouts int,
  http_errors int,
  network_errors int,
  pause_events int,
  earliest_pause_days numeric,
  configured_window_days numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with window_pings as (
    select t.platform, l.*
    from ping_log l
    join targets t on t.id = l.target_id
    where l.ran_at > now() - make_interval(days => p_days)
  ),
  pings as (
    select
      platform,
      count(distinct target_id)::int as targets,
      count(*)::int as pings,
      round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) as ok_rate,
      (percentile_cont(0.5) within group (order by latency_ms) filter (where ok))::int as p50_ms,
      (percentile_cont(0.95) within group (order by latency_ms) filter (where ok))::int as p95_ms,
      count(*) filter (where error like 'timeout%')::int as timeouts,
      count(*) filter (where not ok and status_code is not null)::int as http_errors,
      count(*) filter (where not ok and status_code is null and coalesce(error, '') not like 'timeout%')::int as network_errors
    from window_pings
    group by platform
  ),
  pauses as (
    select platform, count(*)::int as pause_events, round(min(days_since_last_ok), 2) as earliest_pause_days
    from pause_events
    where detected_at > now() - make_interval(days => p_days)
    group by platform
  )
  select p.platform, p.targets, p.pings, p.ok_rate, p.p50_ms, p.p95_ms, p.timeouts, p.http_errors,
         p.network_errors, coalesce(x.pause_events, 0), x.earliest_pause_days,
         round(w.pause_window_seconds / 86400.0, 2)
  from pings p
  left join pauses x on x.platform = p.platform
  left join platform_pause_windows w on w.platform = p.platform
  order by p.pings desc;
$$;

revoke all on function platform_stats(int) from public, anon, authenticated;
grant execute on function platform_stats(int) to service_role;
