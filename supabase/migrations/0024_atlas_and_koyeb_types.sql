-- MongoDB Atlas and Koyeb become platforms. Atlas has no HTTP endpoint that counts as
-- activity, so its heartbeat opens a real database connection: db_connect. Values are
-- added here and used in the next migration, as Postgres needs them committed first.
alter type platform add value if not exists 'mongodb';
alter type platform add value if not exists 'koyeb';
alter type heartbeat_type add value if not exists 'db_connect';
