-- The same function ProjectSleeve asks users to add to their own projects, installed here so
-- the engine's self-check target exercises the recommended path rather than a table read.
create or replace function public.keepalive() returns int
language sql stable
set search_path = ''
as 'select 1';

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
