# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fluitplanner: a field hockey umpire availability and match assignment app. Two interfaces:
1. **Planner (admin)**: upload matches (excel/csv/paste), CRUD matches & umpires, assign umpires to matches, generate availability poll links
2. **Umpire (user)**: mobile-responsive availability polls (yes/if need be/no) for time slots, similar to Rallly/Doodle

Availability polls use 2-hour time slots (not exact match times). Slots start at least 30 min before match time, rounded to nearest quarter hour. Each match requires two umpires.

## Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm test           # Run unit/component tests (vitest)
npm run test:watch # Watch mode for TDD red/green cycles
npm run test:e2e   # Run E2E tests (playwright, starts dev server)
```

Use red/green TDD per `app_description.md`: write a failing test first, then implement.

### Test Structure

- `__tests__/` — unit tests (mirror source structure)
- `components/__tests__/` — component tests (colocated)
- `e2e/` — Playwright E2E tests
- Config: `vitest.config.ts`, `playwright.config.ts`

## Tech Stack & Architecture

- **Next.js** (App Router) on **Vercel** with Fluid Compute enabled (`cacheComponents: true` in next.config.ts)
- **Supabase** for database, auth, and backend (via `@supabase/ssr`)
- **TailwindCSS** with CSS variables for theming (dark mode via class strategy)
- **shadcn/ui** (new-york style, RSC-enabled) — add components via `npx shadcn@latest add <component>`
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
