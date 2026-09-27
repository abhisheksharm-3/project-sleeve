-- A second tier. Plans are data: this insert is the whole change, and no feature code
-- branches on the plan id, because every gate reads entitlements().
insert into plans (id, name, limits) values (
  'max',
  'Max',
  '{"max_projects": 100, "max_targets": 100, "min_interval_seconds": 600,
    "platform_min_interval_seconds": {"render": 600, "huggingface": 600},
    "heartbeat_types": ["plain", "db_query"], "channels": ["email"]}'::jsonb
)
on conflict (id) do update set name = excluded.name, limits = excluded.limits;
