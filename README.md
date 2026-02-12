# Fluitplanner

Field hockey umpire availability and match assignment tool.

## What it does

1. **Planner** uploads matches (Excel/CSV/paste) and manages umpires
2. **Umpires** receive a link and indicate availability (yes / if need be / no) for time slots
3. **Planner** assigns two umpires per match based on availability

Availability polls use 2-hour time slots, not exact match times. Slots start at least 30 minutes before the match, rounded to the nearest quarter hour.

## Tech stack

- **Next.js** (App Router) deployed on **Vercel**
- **Supabase** for database and auth
- **TailwindCSS** + **shadcn/ui** for UI
- **Vitest** + **React Testing Library** for unit/component tests
- **Playwright** for E2E tests

## Getting started

1. Create a [Supabase project](https://database.new)
2. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL and publishable key
3. Install dependencies and run:

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev        # Dev server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm test           # Unit/component tests
npm run test:watch # TDD watch mode
npm run test:e2e   # E2E tests (auto-starts dev server)
```
