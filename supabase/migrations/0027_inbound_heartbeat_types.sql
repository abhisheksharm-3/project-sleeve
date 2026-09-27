-- Inbound heartbeats: the user's own job pings us, and silence is the failure. Values are
-- added here and used in the next migration, as Postgres needs them committed first.
alter type platform add value if not exists 'heartbeat';
alter type heartbeat_type add value if not exists 'inbound';

-- A name the user gives a target; heartbeats have no URL of their own to describe them.
alter table targets add column if not exists label text check (char_length(label) <= 80);
