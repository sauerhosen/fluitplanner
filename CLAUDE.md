# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fluitplanner: a field hockey umpire availability and match assignment app. Two interfaces:

1. **Planner (admin)**: upload matches (excel/csv/paste), CRUD matches & umpires, assign umpires to matches, generate availability poll links
2. **Umpire (user)**: mobile-responsive availability polls (yes/if need be/no) for time slots, similar to Rallly/Doodle

Availability polls use 2-hour time slots (not exact match times). Slots start at least 30 min before match time, rounded to nearest quarter hour. Each match requires two umpires.

## Git Workflow

Never commit directly to `main`. Always create a feature branch before making any changes (e.g., `git checkout -b feat/my-feature`). Use pull requests to merge into `main`.

## Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run format     # Format all files with Prettier
npm run format:check # Check formatting without writing
npm test           # Run unit/component tests (vitest)
npm run test:watch # Watch mode for TDD red/green cycles
npm run test:e2e   # Run E2E tests (playwright, starts dev server)
npm run type-check # TypeScript type checking
```

Use red/green TDD per `app_description.md`: write a failing test first, then implement.

### Code Quality

Pre-commit hook (husky + lint-staged) automatically runs ESLint and Prettier on staged files. Do not skip hooks with `--no-verify`.

CI (GitHub Actions) runs lint, format check, type check, tests, and build on every PR and push to main. Releases are managed by release-please using conventional commits — use prefixes like `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

### Test Structure

- `__tests__/` — unit tests (mirror source structure)
- `components/__tests__/` — component tests (colocated)
- `e2e/` — Playwright E2E tests
- Config: `vitest.config.ts`, `playwright.config.ts`

## Tech Stack & Architecture

- **Next.js** (App Router) on **Vercel** with Fluid Compute enabled (`cacheComponents: true` in next.config.ts)
- **Supabase** for database, auth, and backend (via `@supabase/ssr`)
- **TailwindCSS v4** with CSS-first configuration (no `tailwind.config.ts`). All theme config is in `app/globals.css` via `@theme inline`. Dark mode uses `@custom-variant dark` with class strategy.
- **shadcn/ui** (new-york style, RSC-enabled) — add components via `npx shadcn@latest add <component>`. Components use `data-slot` attributes (not `forwardRef`).
- **next-themes** for dark/light mode switching

## Key Patterns

### Supabase Client Creation

- **Server**: `import { createClient } from "@/lib/supabase/server"` — always `await createClient()` fresh per request (never store in a global due to Fluid Compute)
- **Client**: `import { createClient } from "@/lib/supabase/client"` — browser client
- **Proxy** (`proxy.ts`): refreshes auth sessions, redirects unauthenticated users to `/auth/login` (except `/` and `/auth/*` routes)

### Path Aliases

`@/*` maps to project root (e.g., `@/components`, `@/lib`)

### Route Structure

- `/` — public landing page
- `/auth/*` — login, sign-up, forgot-password, update-password, confirmation
- `/protected/*` — authenticated pages (layout includes nav with auth button)

### Environment Variables

Required in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
