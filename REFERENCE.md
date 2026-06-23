# Reference

Detailed project context for Fluitplanner. See [CLAUDE.md](CLAUDE.md) for critical rules.

## Project Overview

Fluitplanner: a field hockey umpire availability and match assignment app.

1. **Planner (admin)**: upload matches (Excel/CSV/paste), CRUD matches & umpires, assign umpires to matches, generate availability poll links
2. **Umpire (user)**: mobile-responsive availability polls (yes/if need be/no) for time slots, similar to Rallly/Doodle

Availability polls use 2-hour time slots (not exact match times). Slots start at least 20 min before match time, rounded down to nearest quarter hour. Each match requires two umpires.

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

## Tech Stack

- **Next.js** (App Router) on **Vercel** with Fluid Compute
- **Supabase** for database, auth, and backend (via `@supabase/ssr`)
- **TailwindCSS v4** — CSS-first config in `app/globals.css`. Dark mode via `@custom-variant dark` (class strategy).
- **shadcn/ui** (new-york style, RSC-enabled) — `npx shadcn@latest add <component>`
- **next-themes** for dark/light mode switching
- **next-intl** for i18n (English + Dutch)

## Key Patterns

### Supabase Client

- **Server**: `import { createClient } from "@/lib/supabase/server"` — `await createClient()` per request
- **Client**: `import { createClient } from "@/lib/supabase/client"`
- **Proxy** (`proxy.ts`): refreshes auth sessions, redirects unauthenticated users to `/auth/login`
- **Server actions**: use `"use server"` + `requireAuth()` helper

### i18n (next-intl)

- Config: `i18n/request.ts`, messages: `messages/en.json` + `messages/nl.json`
- Flat namespace keys (e.g., `"nav"`, `"dashboard"`, `"polls"`)
- Server: `const t = await getTranslations("namespace")`
- Client: `const t = useTranslations("namespace")`
- Date/time: `useFormatter()`/`getFormatter()` with `hour12: false`
- `LocaleDetector` auto-detects browser language; `LanguageSwitcher` in nav + footer

### Route Structure

- `/` — public landing page
- `/auth/*` — login, sign-up, forgot-password, update-password, confirmation
- `/protected/*` — authenticated pages (layout includes nav with auth button)

### Test Structure

- `__tests__/` — unit tests (mirror source structure)
- `components/__tests__/` — component tests (colocated)
- `e2e/` — Playwright E2E tests
- Config: `vitest.config.ts`, `playwright.config.ts`
- Test render helper: `__tests__/helpers/render.tsx` (wraps with NextIntlClientProvider)
- Server component tests: mock `next-intl/server` with `vi.mock`
- E2E unauthenticated: `test.use({ storageState: { cookies: [], origins: [] } })`
- E2E authenticated: global auth state in `e2e/.auth/state.json`

### Error Handling

- Dashboard uses Suspense streaming — each section in its own `<Suspense>` boundary
- Error boundaries: thin `error.tsx` wrappers around shared `ErrorBoundaryContent`

### CI/CD

- GitHub Actions: lint, format check, type check, tests, build on every PR and push to main
- Releases managed by release-please using conventional commits

## Local Supabase Development

Uses **Podman** (not Docker). See [`docs/local-supabase.md`](docs/local-supabase.md) for full guide.

- **Start**: `npm run supabase:start` (requires Podman machine running)
- **Seed from production**: `npm run supabase:seed` then `npm run supabase:reset`
- **Local services**: API `:54321`, DB `:54322`, Studio `:54323`, Mailpit `:54324`

## Environment Variables

Required in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` — local: `http://127.0.0.1:54321`, remote: `https://<project>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — from `supabase status` or Supabase dashboard
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for server-side operations bypassing RLS
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — AWS SES (not needed locally, Mailpit captures emails)
- `SMTP_FROM` — sender address (e.g. `Fluitplanner <noreply@fluitplanner.nl>`)
- `NEXT_PUBLIC_SITE_URL` — base URL for magic links (e.g. `https://fluitplanner.nl`)
