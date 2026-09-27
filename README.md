# ProjectSleeve

Keep-alive for free-tier backends. Supabase pauses a free project after a week without
database activity, Render sleeps after fifteen minutes, Appwrite pauses after a week,
MongoDB Atlas pauses a free cluster after 30 days without a connection, Koyeb sleeps after
an hour, and Hugging Face Spaces sleep on their own timer. ProjectSleeve checks each backend the way
its platform counts activity, on a schedule that does not switch itself off.

Live at [projectsleeve.vercel.app](https://projectsleeve.vercel.app).

## What it does

- **Keeps backends awake.** Supabase checks call a `keepalive()` function inside Postgres,
  because a page visit is not database activity. Appwrite checks write a heartbeat row.
  Atlas checks open a real connection and send `ping`. Render, Koyeb, Hugging Face and
  plain URLs are visited on a cadence shorter than their sleep timer. Neon and Fly.io are
  left out on purpose: both scale to zero by design and wake on the next request, and
  keeping them awake only spends the user's quota or money.
- **Imports from GitHub.** Sign in with GitHub, pick repositories, and each becomes a
  project. A scan reads `render.yaml`, `.env` examples and the README for backends, and
  finds keep-alive GitHub Actions that GitHub has switched off after 60 quiet days.
  Private repositories come in through a GitHub App, and a push that changes a scanned
  file re-scans the project.
- **One-click Supabase setup.** Connect a Supabase account and pick a project; the
  function and key are installed for you. Optionally, auto-restore brings a project back
  if it pauses anyway.
- **Watches and tells you.** A dashboard with each backend's last 30 days, alerts when
  checks fail or a pause is close, and a Monday digest, over Discord or Slack.
- **Shared projects.** Invite a teammate with a single-use link. They see the project and
  its history, get its alerts and digest, and can run checks and maintenance; only the
  owner changes what is kept awake. Nobody but the service role can read a backend's
  secret.
- **Scheduled jobs and maintenance.** A cron job or script can ping a heartbeat URL and
  alert when it goes quiet, and any backend can go into maintenance, which holds alerts and
  shows as planned on status pages while checks keep running.
- **Public status pages.** Pick backends, name them, post notices, and share a page with
  90-day uptime, response times and outage history, plus a badge, an embeddable image
  and an iframe widget.

## API

Create a token under API tokens in the account menu, and send it as
`Authorization: Bearer sleeve_…`. Tokens act as their owner and obey the same plan limits
and URL checks as the forms.

| Call                              | Does                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `GET /api/v1/projects`            | Your projects and the backends in each                 |
| `POST /api/v1/targets`            | Adds a `website` (`url`) or `heartbeat` (`label`, `interval_seconds`) to a `project_id` |
| `DELETE /api/v1/targets/{id}`     | Removes one backend                                    |
| `DELETE /api/v1/targets?url=…`    | Removes the website with that URL, for preview teardown |

A heartbeat's `ping_url` is what your job calls when it runs; add `/fail` to report a
failed run.

## How it works

```
pg_cron ──every minute──▶ pinger (Edge Function) ──▶ your backends
   │                          │
   │                          └─▶ ping_log ──▶ target_health, alerts
   ├──every 15 min──▶ alerter ──▶ email, Discord, Slack
   ├──every 30 min──▶ restorer ──▶ Supabase Management API (opt-in)
   └──Mondays──────▶ digest ───▶ Discord, Slack

Next.js app (Vercel) ── reads through RLS, writes through server actions ──▶ Postgres
```

- **Engine:** Supabase Postgres with `pg_cron` and `pg_net`. Cron calls the Deno Edge
  Functions in `supabase/functions`, authenticated with a shared secret held in Vault.
- **App:** Next.js 16 and React 19 in `web/`, with Tailwind v4, TypeScript 7 and Biome.
- **Access:** users read only their own rows through row-level security. Every write is a
  server action that checks ownership, then uses the service role.
- **Safety:** target URLs are resolved and refused if they point at private addresses. Only
  anon or publishable Supabase keys are accepted. Webhook URLs must be Discord or Slack.
  GitHub webhooks are signature-checked. Stored Supabase tokens live in Vault.

## Repository layout

| Path                  | What is there                                              |
| --------------------- | ---------------------------------------------------------- |
| `web/`                | The Next.js app: pages, server actions, and `lib/` helpers |
| `web/e2e/`            | Playwright end-to-end tests                                |
| `supabase/migrations` | The database schema, policies, views and cron jobs         |
| `supabase/functions`  | Edge Functions: `pinger`, `alerter`, `digest`, `restorer`  |
| `tests/integration`   | Deno tests for the engine against a real database          |

## Running it locally

You need Node 24, Deno 2 and a Supabase project.

```sh
npm install                  # the Supabase CLI, at the repo root
npx supabase link --project-ref <ref>
npx supabase db push         # apply migrations

cd web
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
```

Deploy the Edge Functions with
`npx supabase functions deploy pinger alerter digest restorer`, then store their URLs and
the cron secret in Vault as `pinger_url`, `alerter_url`, `digest_url`, `restorer_url` and
`cron_secret`. Each cron job does nothing until its URL exists.

## Environment

The web app reads these from `web/.env.local` locally and from the Vercel project in
production.

| Variable                         | Needed for                                          |
| -------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Everything                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Everything; the publishable key                     |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server actions and public pages                     |
| `NEXT_PUBLIC_SITE_URL`           | Redirects and link previews                         |
| `ADMIN_USER_IDS`                 | The platform benchmarks page, comma-separated       |
| `SUPABASE_OAUTH_CLIENT_ID`       | One-click Supabase setup and auto-restore           |
| `SUPABASE_OAUTH_CLIENT_SECRET`   | One-click Supabase setup and auto-restore           |
| `GITHUB_APP_ID`                  | Private repositories                                |
| `GITHUB_APP_SLUG`                | Private repositories                                |
| `GITHUB_APP_PRIVATE_KEY`         | Private repositories; the PEM, newlines or `\n`     |
| `GITHUB_APP_WEBHOOK_SECRET`      | Re-scan on push                                     |

Features whose variables are unset stay hidden. The Edge Functions need
`SLEEVE_CRON_SECRET`, and the restorer needs `SLEEVE_OAUTH_CLIENT_ID` and
`SLEEVE_OAUTH_CLIENT_SECRET`, set with `npx supabase secrets set`. Supabase refuses secret
names that start with `SUPABASE_`. Email alerts need `RESEND_API_KEY`; without it,
alerts go only to Discord or Slack.

## Tests

```sh
cd web
npm test              # unit tests, node --test
npm run test:e2e      # Playwright, against localhost and the Supabase project in .env.local
npm run lint          # Biome
npm run typecheck

deno task test:unit   # Edge Function unit tests, from the repo root
```

The Playwright suite signs in as throwaway users and deletes them afterwards, so it is
safe to run against a project with real data. The Deno integration suite
(`deno task test:int`) is not: it truncates the engine tables of whatever project
`SUPABASE_URL` points at, so run it only against a separate project.

CI runs lint, types, unit tests and a build for the web app, checks and unit tests for
the Edge Functions, and the Playwright suite. It needs the repository secrets
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
and `APP_WEBHOOK_SECRET`.
