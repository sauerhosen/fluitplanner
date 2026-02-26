# CLAUDE.md

## Rules

- **Never commit to `main`**. Always create a feature branch and use PRs.
- **Conventional commits** required (`feat:`, `fix:`, `chore:`, `test:`, `docs:`) — drives release-please.
- **Never skip pre-commit hooks** (`--no-verify`). They run ESLint + Prettier.
- **TDD**: write a failing test first, then implement (see `app_description.md`).

## Footgun Prevention

- **Supabase server client**: always `await createClient()` fresh per request — never cache in a global (Fluid Compute reuses processes).
- **TailwindCSS v4**: CSS-first config in `app/globals.css` via `@theme inline`. There is no `tailwind.config.ts` — don't create one.
- **shadcn/ui**: components use `data-slot` attributes, not `forwardRef`.
- **next-intl**: uses "without i18n routing" — cookie-based locale, no `[locale]` URL segment. Don't add locale to routes.
- **Date/time formatting**: always use `hour12: false` (Dutch locale, 24h clock). Don't use `format.dateTime()` for machine-parseable values (e.g. `<input type="time">`).
- **Dependencies**: pin with caret ranges (`^1.2.3`), never `"latest"` — breaks `npm ci`.

## Reference

See [REFERENCE.md](REFERENCE.md) for architecture, commands, environment variables, test patterns, and local dev setup.
