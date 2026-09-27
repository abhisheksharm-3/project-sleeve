-- The dashboard shows 30 days per backend; the project page still draws the last 14.
create or replace view target_daily_uptime with (security_invoker = true) as
select target_id, date_trunc('day', ran_at)::date as day,
       count(*)::int as pings, count(*) filter (where ok)::int as ok
from ping_log
where ran_at > now() - interval '30 days'
group by target_id, date_trunc('day', ran_at);
