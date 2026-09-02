# Fluitplanner

Field hockey umpire availability and match assignment tool, running as a multi-club service —
each club gets its own subdomain and sees only its own data.

## What it does

1. **Planner** gets matches in — imported from Excel/CSV/paste, or synced nightly from the Hockey.nl Match Center — and manages the club's umpires
2. **Umpires** receive a link and indicate availability (yes / if need be / no) for time slots, without needing an account
3. **Planner** assigns two umpires per match based on availability, first as a tentative draft and then confirmed
4. **Planner** exports the result — per poll or as a per-date day sheet (XLSX, HTML, Markdown, clipboard)

Availability polls use 2-hour time slots, not exact match times. Slots start at least 20 minutes before the match, rounded down to the nearest quarter hour.

A planner can also connect their own AI assistant to their club's data through the built-in
[MCP server](docs/mcp-server.md).

## Tech stack

- **Next.js** (App Router) deployed on **Vercel**, with a nightly cron job for the match sync
- **Supabase** for database and auth
- **TailwindCSS** + **shadcn/ui** + **next-themes** for UI
- **next-intl** for i18n (English + Dutch)
- **MCP** server with a self-hosted OAuth authorization server
- **Vitest** + **React Testing Library** for unit/component tests
- **Playwright** for E2E tests

## Getting started

Copy `.env.example` to `.env.local` and fill it in, then:

```bash
npm install
npm run dev
```

For the database you can either point at a [Supabase project](https://database.new) of your
own, or run the full stack locally — see [`docs/local-supabase.md`](docs/local-supabase.md).
The local option is what the E2E tests expect.

## Scripts

```bash
npm run dev            # Dev server (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint
npm run format         # Format with Prettier
npm run type-check     # TypeScript
npm test               # Unit/component tests
npm run test:watch     # TDD watch mode
npm run test:e2e       # E2E tests against a production build
npm run test:e2e:dev   # E2E tests against the dev server (faster)
npm run supabase:start # Start local Supabase (Podman)
npm run supabase:reset # Re-apply migrations + seed data
```

E2E tests need local Supabase running, `SUPABASE_SERVICE_ROLE_KEY` set, and an organization
with slug `default` in the database. `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` are optional —
without them the setup uses a built-in test account and creates it if it does not exist.

## Documentation

- [Multi-tenancy](docs/multi-tenancy.md) — subdomains, tenant resolution, roles
- [Page chrome](docs/page-chrome.md) — the page header and toolbar pattern
- [MCP server](docs/mcp-server.md) — connecting an AI assistant
- [Hockey.nl sync](docs/hockey-sync.md) — tracked teams, the nightly cron, review flags
- [Local Supabase](docs/local-supabase.md) — running the stack on Podman
