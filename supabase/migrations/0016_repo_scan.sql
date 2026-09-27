-- What a repository scan found: backends named in its config files, and any hand-rolled
-- keep-alive workflow with GitHub's own state for it. Written at import and on request,
-- read on the project page, so the GitHub API is not called on every page load.
alter table projects add column if not exists scan jsonb;
alter table projects add column if not exists scanned_at timestamptz;
