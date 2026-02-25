# Local Supabase Development with Podman

This project uses a local Supabase instance for development and E2E testing, running on **Podman** (not Docker).

## Prerequisites

- **Podman** installed and machine running: `podman machine start`
- **Supabase CLI**: `brew install supabase/tap/supabase`

## Quick Start

```bash
# 1. Start the local Supabase stack
npm run supabase:start

# 2. Seed with production data (first time only)
npm run supabase:seed    # dumps remote data to supabase/seed.sql
npm run supabase:reset   # applies migrations + seed

# 3. Update .env.local with local credentials
# Copy values from `supabase status` output (see below)

# 4. Start the dev server
npm run dev
```

## Environment Setup

After `supabase start`, run `supabase status` to get the local keys. Update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

SMTP variables are not needed locally — Mailpit captures all emails.

## Local Services

| Service  | URL                    | Purpose                                         |
| -------- | ---------------------- | ----------------------------------------------- |
| API      | http://localhost:54321 | Supabase REST/Auth API                          |
| Database | localhost:54322        | PostgreSQL (user: `postgres`, pass: `postgres`) |
| Studio   | http://localhost:54323 | Database admin UI                               |
| Mailpit  | http://localhost:54324 | Email capture (replaces SES)                    |

## Convenience Scripts

| Script                   | Command                                            |
| ------------------------ | -------------------------------------------------- |
| `npm run supabase:start` | Start all local Supabase containers                |
| `npm run supabase:stop`  | Stop all containers                                |
| `npm run supabase:reset` | Re-apply all migrations + seed data                |
| `npm run supabase:seed`  | Dump remote production data to `supabase/seed.sql` |

## Seeding

`supabase/seed.sql` contains a full data dump from production and is **gitignored** (sensitive data). To create or refresh it:

```bash
npm run supabase:seed    # creates/overwrites supabase/seed.sql
npm run supabase:reset   # drops DB, re-applies migrations, then runs seed.sql
```

After reset, you can verify data in Studio at http://localhost:54323.

## E2E Tests

E2E tests run against the local Supabase instance. The test setup (`e2e/global-setup.ts`) automatically:

1. Creates an E2E test user (`e2e-test@fluitplanner.test`) if it doesn't exist
2. Ensures the test user has `planner` role in the `default` organization
3. Saves authenticated browser state to `e2e/.auth/state.json`

```bash
npm run test:e2e       # production build — reliable, for CI
npm run test:e2e:dev   # dev server — fast iteration when writing tests
```

The production build (`test:e2e`) uses `npm run build && npm run start` to avoid Turbopack dev-mode SSR quirks. The dev variant (`test:e2e:dev`) reuses a running `npm run dev` process for speed.

## Database Access

Connect directly to the local PostgreSQL:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres
```

## Migrations

Migrations live in `supabase/migrations/`. To create a new migration:

```bash
supabase migration new <name>
```

To apply migrations without re-seeding:

```bash
supabase db push
```

## Troubleshooting

### "Cannot connect to Docker daemon"

Supabase CLI looks for the Docker socket at `~/.docker/run/docker.sock`, but Podman exposes it at `/var/run/docker.sock`. Fix:

```bash
export DOCKER_HOST=unix:///var/run/docker.sock
```

Add this to your shell profile (`.zshrc` / `.bashrc`) to make it permanent.

### Podman machine stopped / containers gone

```bash
podman machine stop
podman machine start
supabase stop    # clean up stale state
supabase start   # re-pull and start containers
```

### Port conflicts

If ports 54321-54324 are in use, stop any other Supabase/Docker instances first:

```bash
supabase stop --no-backup
```

### Switching between local and remote

To switch back to the remote Supabase instance, update `.env.local` with the remote credentials (available in the Supabase dashboard). The remote values are commented out in `.env.example` for reference.
