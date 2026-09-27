-- Profiles are written only by the signup trigger and the service role. The old update
-- policy let a user rewrite their own github_username, which the GitHub App install check
-- relied on; the app never needed client writes here.
drop policy if exists "update own profile" on profiles;
revoke insert, update, delete on profiles from anon, authenticated;
