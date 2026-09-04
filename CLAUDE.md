# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fluitplanner: a field hockey umpire availability and match assignment app, running as a
multi-club (multi-tenant) service. Each club gets its own subdomain; a club's planner
manages only that club's data.

Three human audiences plus one machine surface:

1. **Planner (club admin)**: import matches (Excel/CSV/paste) or sync them from Hockey.nl, CRUD matches & umpires, run availability polls, assign umpires (tentative → confirmed), export day sheets
2. **Umpire (user)**: mobile-responsive availability polls (yes/if need be/no) for time slots, similar to Rallly/Doodle — no account, reached via a poll token link
3. **Master admin**: on the root domain only — creates/disables clubs, invites planners, manages accounts (`/protected/organizations`, `/protected/users`)
4. **MCP server** (`/api/mcp`): lets a planner connect their own AI assistant to their club's data — see [`docs/mcp-server.md`](docs/mcp-server.md)

Availability polls use 2-hour time slots (not exact match times). Slots start at least 20 min before match time, rounded down to nearest quarter hour. Each match requires two umpires.

## Git Workflow

Never commit directly to `main`. Always create a feature branch before making any changes (e.g., `git checkout -b feat/my-feature`). Use pull requests to merge into `main`.

## Commands

```bash
npm run dev            # Start dev server (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint
npm run format         # Format all files with Prettier
npm run format:check   # Check formatting without writing
npm test               # Run unit/component tests (vitest)
npm run test:watch     # Watch mode for TDD red/green cycles
npm run test:e2e       # Run E2E tests (playwright, production build)
npm run test:e2e:dev   # Run E2E tests against dev server (faster)
npm run type-check     # TypeScript type checking
npm run supabase:start # Start local Supabase (requires Podman)
npm run supabase:stop  # Stop local Supabase
npm run supabase:reset # Re-apply migrations + seed data
npm run supabase:seed  # Dump production data to supabase/seed.sql
```

Use red/green TDD per `app_description.md`: write a failing test first, then implement.

### Code Quality

Pre-commit hook (husky + lint-staged) automatically runs ESLint and Prettier on staged files. Do not skip hooks with `--no-verify`.

CI (GitHub Actions) runs lint, format check, type check, tests, and build on every PR and push to main. Releases are managed by release-please using conventional commits — use prefixes like `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

### Test Structure

- `__tests__/` — unit tests, broadly mirroring source layout (`lib/`, `app/`, `hooks/`, `i18n/`, plus a legacy top-level `domain/` alongside `lib/domain/`)
- `__tests__/helpers/render.tsx` — render helper that wraps components in `NextIntlClientProvider`
- `components/__tests__/` — component tests (colocated)
- `e2e/` — Playwright E2E tests; `e2e/global-setup.ts` logs in once and writes `e2e/.auth/state.json` (auth session + `x-tenant` cookie)
- Config: `vitest.config.ts`, `playwright.config.ts` (production build), `playwright.dev.config.ts` (dev server)

E2E tests need local Supabase running, `SUPABASE_SERVICE_ROLE_KEY` set, and an organization
with slug `default` in the database — global setup throws without them. `E2E_TEST_EMAIL` /
`E2E_TEST_PASSWORD` are optional; unset, the setup falls back to a built-in test account and
creates it if missing.

## Tech Stack & Architecture

- **Next.js** (App Router) on **Vercel** with Fluid Compute
- **Supabase** for database, auth, and backend (via `@supabase/ssr`)
- **TailwindCSS v4** with CSS-first configuration (no `tailwind.config.ts`). All theme config is in `app/globals.css` via `@theme inline`. Dark mode uses `@custom-variant dark` with class strategy.
- **Page chrome**: one identity row (`components/shared/page-header.tsx`) plus a sticky toolbar (`components/shared/sticky-toolbar.tsx`) — see [`docs/page-chrome.md`](docs/page-chrome.md) before adding anything to the top of a page
- **shadcn/ui** (new-york style, RSC-enabled) — add components via `npx shadcn@latest add <component>`. Components use `data-slot` attributes (not `forwardRef`).
- **next-themes** for dark/light mode switching
- **next-intl** for i18n (English + Dutch), cookie-based locale without URL routing
- **MCP** (`mcp-handler` + `@modelcontextprotocol/server`) with a self-hosted OAuth authorization server for AI-assistant access
- **Vercel cron** (`vercel.json`) drives the nightly Hockey.nl match sync

## Key Patterns

### Supabase Client Creation

- **Server**: `import { createClient } from "@/lib/supabase/server"` — always `await createClient()` fresh per request (never store in a global due to Fluid Compute)
- **Client**: `import { createClient } from "@/lib/supabase/client"` — browser client
- **Service role**: `import { createServiceClient } from "@/lib/supabase/service"` — bypasses RLS. Server actions / route handlers only, and **always** with an explicit `organization_id` filter. Used by the cron sync, the MCP server, and OAuth.

### Auth & Roles

Server actions gate through `lib/auth.ts` — never re-implement the checks inline:

- `requireAuthContext()` — returns `{ supabase, user }`, throws `"Not authenticated"`
- `requireMember()` — returns `{ supabase, user, tenantId, role }`, throws `NOT_MEMBER`; for reads any club member may perform
- `requirePlanner()` — returns `{ supabase, user, tenantId }`, throws the `NOT_PLANNER` sentinel for non-planners (one auth round trip + one membership query). **Every mutating server action must use it.**
- `getMembershipRole()` — `"planner" | "viewer" | null`, never throws; for role-aware rendering

Per-user features that are not club-scoped (passkeys) gate on `requireAuthContext()`
alone — the other gates resolve a tenant and would throw for a master admin with no
club membership.

Roles live in `organization_members.role`: `planner` (writes) | `viewer` (strictly read-only; see
the roles section of `docs/multi-tenancy.md` for the three enforcement layers). The protected
layout provides the role via `components/shared/role-provider.tsx`; client components call
`useIsPlanner()` and skip mutation controls for viewers. A not-yet-started `admin` role is
designed in `docs/plans/2026-08-30-club-admin-role-design.md`.

Email-based auth (invite, password reset, magic link, signup confirmation) all
runs through `/auth/confirm` using `{{ .TokenHash }}` links — see
[`docs/auth-email-flows.md`](docs/auth-email-flows.md). The templates in
`supabase/templates/` are local-dev only and **must be mirrored by hand into the
Supabase dashboard**; a stock `{{ .ConfirmationURL }}` template silently breaks
every email link.

**Master admin is not a DB role.** It is `user.app_metadata.is_master_admin` — service-role-writable only — read in RLS via the `public.is_master_admin()` function (migration `20260830000001_master_admin_app_metadata.sql`). Master admin pages additionally require the root domain.

### Multi-tenancy

Every club is an `organizations` row with a `slug`; a subdomain of `NEXT_PUBLIC_BASE_DOMAIN` selects it. See [`docs/multi-tenancy.md`](docs/multi-tenancy.md).

- `lib/tenant-resolver.ts` — pure host → `tenant` | `root` | `fallback` resolution
- `lib/tenant.ts` — `getTenantId()`, `requireTenantId()`, `getTenantSlug()`, `isRootDomain()`, reading the `x-organization-id` / `x-organization-slug` / `x-is-root-domain` / `x-is-fallback-mode` request headers the proxy sets
- Data access is belt-and-braces: RLS policies **and** an explicit `.eq("organization_id", tenantId)` on every query

### Proxy (`proxy.ts` → `lib/supabase/proxy.ts`)

Refreshes the auth session, resolves the tenant, checks membership, and redirects unauthenticated users to `/auth/login` (preserving a `next=` param).

- **Skipped entirely** (no session, no tenant — these self-authenticate): `/api/cron/*` (`CRON_SECRET`), `/api/mcp` (bearer token), `/api/oauth/*`, `/.well-known/*`
- **Not skipped**: `/oauth/authorize` — the consent page needs the session
- **Public with a session pass-through**: `/`, `/auth/*`, `/login`, `/poll/*`, `/no-access`, `/privacy`. The `next=` param is set for every other destination except `/protected`, the login form's default anyway
- Inactive organization → 403; a signed-in non-member on a club subdomain → redirect to `/no-access`

### i18n (next-intl)

- Uses "without i18n routing" — locale stored in a cookie, no `[locale]` URL segment
- Messages: `messages/en.json` and `messages/nl.json` — flat namespace keys (e.g., `"nav"`, `"dashboard"`, `"polls"`)
- Server components: `const t = await getTranslations("namespace")`
- Client components: `const t = useTranslations("namespace")`
- `LocaleDetector` component auto-detects browser language on first visit
- `LanguageSwitcher` toggle in nav and footer

### Path Aliases

`@/*` maps to project root (e.g., `@/components`, `@/lib`)

### Route Structure

Public:

- `/` — landing page
- `/auth/*` — login, sign-up, forgot-password, update-password, confirm, error, sign-up-success
- `/auth/passkey` — WebAuthn ceremony; root domain only (see [`docs/passkeys.md`](docs/passkeys.md))
- `/poll/[token]` — umpire availability poll (no account)
- `/privacy`, `/no-access`

Authenticated (`app/protected/layout.tsx` adds nav, org switcher, auth button):

- `/protected` — dashboard
- `/protected/matches`, `/protected/umpires`
- `/protected/account` — per-user account settings (passkeys); every role, no planner gate
- `/protected/polls`, `/protected/polls/new`, `/protected/polls/[id]`
- `/protected/settings` — managed teams, tracked teams (Hockey.nl sync), availability lock, MCP tokens
- `/protected/organizations`, `/protected/users` — master admin, root domain only

Machine / integration:

- `/api/mcp` — MCP server (bearer token or OAuth)
- `/api/oauth/{register,token,authorization-server-metadata,protected-resource-metadata}` — the `/.well-known/oauth-*` documents are rewritten onto the last two in `next.config.ts`
- `/oauth/authorize` — OAuth consent page (session-gated)
- `/api/cron/hockey-sync` — nightly Match Center sync, `CRON_SECRET`-authenticated

### Module Map (`lib/`)

| Directory        | What lives there                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/actions/`   | `"use server"` server actions, one file per feature area                                                  |
| `lib/domain/`    | Pure domain logic — slots, conflicts, timezone, name normalisation. Unit-tested                           |
| `lib/parsers/`   | Match import: Excel (exceljs), CSV (papaparse), paste, KNHB mapping                                       |
| `lib/export/`    | Export/day-sheet preparation plus XLSX / HTML / Markdown generators                                       |
| `lib/hockey/`    | Hockey.nl Match Center sync — see [`docs/hockey-sync.md`](docs/hockey-sync.md)                            |
| `lib/mcp/`       | MCP auth, tools, org-scoped data, planning helpers                                                        |
| `lib/passkey/`   | Passkey ceremony origin rules and the cross-subdomain `next` validator                                    |
| `lib/oauth/`     | OAuth authorization server: `clients.ts` (DCR/CIMD), `grants.ts` (auth codes), `tokens.ts`, `metadata.ts` |
| `lib/supabase/`  | `server` / `client` / `service` clients and the proxy session logic                                       |
| `lib/types/`     | Shared domain types (`domain.ts`)                                                                         |
| `lib/tenant*.ts` | Tenant resolution and request-scoped tenant accessors                                                     |
| `lib/auth.ts`    | `requireAuthContext()` / `requirePlanner()`                                                               |
| `lib/email.ts`   | Nodemailer / SES transport                                                                                |
| `lib/utils.ts`   | `cn()` and the `hasEnvVars` guard the proxy uses                                                          |

### Local Supabase Development

Local dev uses **Podman** (not Docker) to run the full Supabase stack locally. See [`docs/local-supabase.md`](docs/local-supabase.md) for full setup guide, troubleshooting, and seeding instructions.

Quick reference:

- **Start**: `npm run supabase:start` (requires Podman machine running)
- **Seed from production**: `npm run supabase:seed` then `npm run supabase:reset`
- **Local services**: API `:54321`, DB `:54322`, Studio `:54323`, Mailpit `:54324`
- **E2E tests**: `npm run test:e2e` (production build) or `npm run test:e2e:dev` (dev server)

### Environment Variables

`.env.example` is the source of truth — copy it to `.env.local` and fill it in. What each one is for:

- `NEXT_PUBLIC_SUPABASE_URL` — local: `http://127.0.0.1:54321`, remote: `https://<project>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — from `supabase status` (local) or Supabase dashboard (remote)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for server-side operations that bypass RLS
- `SMTP_HOST` — AWS SES SMTP host (not needed locally — Mailpit captures emails)
- `SMTP_PORT` — SMTP port (587)
- `SMTP_USER` — SES SMTP username
- `SMTP_PASS` — SES SMTP password
- `SMTP_FROM` — sender address (e.g. `Fluitplanner <noreply@fluitplanner.nl>`)
- `NEXT_PUBLIC_SITE_URL` — base URL for magic links (e.g. `https://fluitplanner.nl`)
- `NEXT_PUBLIC_BASE_DOMAIN` — base domain whose subdomains resolve to tenant slugs (defaults to `fluiten.org`)
- `NEXT_PUBLIC_PASSKEY_ORIGIN` — the one origin WebAuthn ceremonies run on; must be the deployment's **canonical** origin and match the Supabase dashboard's Relying Party Origins exactly (defaults to `https://<base domain>`; unset locally). See [`docs/passkeys.md`](docs/passkeys.md)
- `CRON_SECRET` — shared secret for Vercel cron routes (`/api/cron/*`); Vercel sends it automatically as a Bearer token when set
- `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` — account Playwright's global setup logs in with (E2E only; optional, defaults to a built-in test account)

Set automatically by Vercel, not in `.env.local`: `VERCEL_URL` (`app/layout.tsx`,
`metadataBase` fallback) and `NEXT_PUBLIC_VERCEL_URL` (`lib/actions/verification.ts`).

## Documentation

| Doc                                                                  | Covers                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/multi-tenancy.md`](docs/multi-tenancy.md)                     | Subdomains, tenant resolution, roles, data scoping                                                                                                                                                                               |
| [`docs/auth-email-flows.md`](docs/auth-email-flows.md)               | Invite / reset / magic-link emails, the token-hash flow through `/auth/confirm`, and the dashboard templates that must stay in sync                                                                                              |
| [`docs/page-chrome.md`](docs/page-chrome.md)                         | Page header + sticky toolbar pattern — read before touching a page top                                                                                                                                                           |
| [`docs/passkeys.md`](docs/passkeys.md)                               | Passkeys: why ceremonies run on the root domain, the base-domain session cookie, dashboard config that must be mirrored by hand                                                                                                  |
| [`docs/mcp-server.md`](docs/mcp-server.md)                           | MCP server, OAuth, tool inventory                                                                                                                                                                                                |
| [`docs/hockey-sync.md`](docs/hockey-sync.md)                         | Hockey.nl Match Center sync: tracked teams, cron, review flags                                                                                                                                                                   |
| [`docs/hockey-match-center-api.md`](docs/hockey-match-center-api.md) | Reverse-engineered upstream API reference                                                                                                                                                                                        |
| [`docs/local-supabase.md`](docs/local-supabase.md)                   | Local Supabase on Podman: setup, seeding, troubleshooting                                                                                                                                                                        |
| `docs/plans/`                                                        | Dated design & implementation docs. Historical: most record what was built, a few are unbuilt proposals (the club admin role says so in a status header, but most plans carry none — check against the code before trusting one) |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
