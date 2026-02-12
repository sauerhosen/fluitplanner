# GitHub Actions CI/CD Design

## Goal

Automated CI pipeline on PRs/pushes to main, plus release-please for semantic versioning and changelog generation.

## Workflow 1: CI (`ci.yml`)

**Triggers:** push to main, pull requests to main

**Steps:**

1. Checkout + setup Node 22 + `npm ci`
2. Lint — `npm run lint`
3. Format check — `npm run format:check`
4. Type check — `npx tsc --noEmit`
5. Unit/component tests — `npm test`
6. Build — `npm run build`

E2E tests excluded (require Supabase env vars / running backend).

## Workflow 2: Release (`release.yml`)

**Triggers:** push to main only

Uses `google-github-actions/release-please-action` to:

- Auto-create release PRs with version bump + CHANGELOG.md updates
- On merge of release PR: create git tag + GitHub release

Configured for Node/npm with conventional commits.

## Not included (YAGNI)

- Vercel deployment (handled natively by Vercel on push)
- E2E tests in CI (add when Supabase test env is set up)
- Multiple Node versions
