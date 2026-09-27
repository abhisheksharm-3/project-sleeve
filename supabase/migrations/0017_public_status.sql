-- A project owner can publish a status page and README badge. Off by default: until the
-- owner turns it on, nothing about the project is reachable without signing in.
alter table projects add column if not exists public boolean not null default false;
