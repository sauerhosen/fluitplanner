# Test Framework Design

## Stack

- **Vitest** — unit & component tests (fast, native TS/ESM, Vite-based)
- **React Testing Library** (`@testing-library/react`) — component tests with jsdom
- **Playwright** — E2E browser tests

## Structure

```
__tests__/              # Unit tests (mirror src structure)
  lib/
    utils.test.ts
components/
  __tests__/            # Component tests colocated near components
e2e/                    # Playwright E2E tests
```

## Configuration

- `vitest.config.ts` at root — `@/*` path aliases, jsdom environment for component tests
- `playwright.config.ts` at root — targets localhost:3000, Chromium only by default
- npm scripts: `test` (vitest), `test:e2e` (playwright), `test:watch` (vitest watch for TDD)

## Dependencies

Dev dependencies:

- `vitest`, `@vitejs/plugin-react`
- `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- `@playwright/test`

## TDD Workflow

`npm run test:watch` enables red/green TDD — write a failing test, see it fail, implement, see it pass. Vitest watch mode re-runs on file save.
