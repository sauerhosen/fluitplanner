# Passkeys

Passkeys are an **additional** sign-in method for every human role — master
admin, planner, viewer. Passwords are unchanged and keep working; nothing about
the existing email flows moves.

A user enrols from `/protected/account` and afterwards signs in from
`/auth/login` with no email typed: passkeys use discoverable credentials, so the
credential itself identifies the account.

## Why every ceremony runs on the root domain

This is the one thing to understand before changing anything here.

GoTrue validates a WebAuthn ceremony's origin against **`rp_origins`, an
exact-match allow-list capped at five entries with no wildcard support**
(`RPOrigins []string` in `supabase/auth`, `internal/conf/configuration.go`).
Fluitplanner gives every club its own subdomain, and each subdomain is a
separate origin — so listing them individually runs out after a handful of clubs
and needs a manual Supabase config change every time a club is added.

Instead, ceremonies happen only on the apex (`fluiten.org`), which spends a
single slot and scales to any number of clubs. A club page bounces to
`/auth/passkey` on the apex and comes back:

```
hic.fluiten.org/auth/login
   [Sign in with a passkey]
        │
        ▼
fluiten.org/auth/passkey?mode=signin&next=https://hic.fluiten.org/protected
   WebAuthn ceremony → session cookie on .fluiten.org
        │
        ▼
hic.fluiten.org/protected   (signed in)
```

Note what is _not_ the reason. The browser would happily let `hic.fluiten.org`
request `rp_id=fluiten.org` — WebAuthn allows a registrable-domain suffix. It is
the **server-side** origin check that forces the bounce. That also means
credentials are stored against `rp_id=fluiten.org`, so if Supabase ever ships
wildcard origins the redirect can simply be deleted and every passkey already
enrolled keeps working.

`lib/passkey/ceremony-url.ts` holds the rule: **if the browser is already on the
ceremony origin, run inline; otherwise redirect.** Two cases fall out of it for
free — master admins are already on the apex, and local development runs on
`localhost:3000` with `rp_id = "localhost"`. Neither needs a special case, and
the second is what keeps the flow testable locally without wildcard DNS or TLS.

`www` is deliberately _not_ treated as "already home": it resolves as the root
surface for tenancy, but `https://www.fluiten.org` is a different WebAuthn
origin and is not in `rp_origins`.

## The session cookie spans the base domain

A sign-in on the apex is worthless if the session it creates does not work on
`hic.fluiten.org`, so the Supabase auth cookie is scoped to the base domain
rather than the host. That change landed separately and is documented in
[`multi-tenancy.md`](multi-tenancy.md#the-session-cookie-spans-the-base-domain),
including the `Secure` flag, the loopback exception, and how sessions that
predate it are migrated.

Two consequences matter here: the cookie is `httpOnly: false` and readable on
every subdomain, so **no club subdomain may ever be pointed at third-party
hosting**; and the `x-tenant` cookie deliberately stays host-only, because it
picks a club and one subdomain has no business rewriting another's.

## Configuration

Local development is configured in `supabase/config.toml`:

```toml
[auth.passkey]
enabled = true

[auth.webauthn]
rp_display_name = "Fluitplanner"
rp_id = "localhost"
rp_origins = ["http://localhost:3000"]
```

**Production is dashboard-only and must be mirrored by hand** — the same trap as
`supabase/templates/` (see [`auth-email-flows.md`](auth-email-flows.md)). Under
_Authentication → Passkeys_:

| Setting                    | Value                 |
| -------------------------- | --------------------- |
| Relying Party Display Name | `Fluitplanner`        |
| Relying Party ID           | `fluiten.org`         |
| Relying Party Origins      | `https://fluiten.org` |

Two warnings worth taking seriously:

1. **The RP ID is permanent.** Passkeys are cryptographically bound to it;
   changing it makes every enrolled passkey unusable and every user has to
   enrol again. It must be the base domain, where the clubs live — which also
   means passkeys will not work on any other domain that serves sign-in.
2. **Origin budget.** Production spends 1 of its 5 slots. Local development runs
   its own GoTrue, so `http://localhost:3000` costs nothing in production. Vercel
   preview hosts (`*.vercel.app`) can never match, so `passkeysAvailable()`
   hides the buttons there rather than letting them fail.

## Removing a passkey

The account page lists what is enrolled and each entry can be removed, behind an
`AlertDialog` confirmation, via `supabase.auth.passkey.delete({ passkeyId })`.
Removing one is safe to offer without ceremony: passwords are untouched by this
feature, so a user can always still sign in and enrol again.

The list is server-rendered, so the component calls `router.refresh()` after a
delete rather than patching local state.

## Not yet built

**Renaming.** `supabase.auth.passkey.update({ passkeyId, friendlyName })` exists
but is not wired up. Note that `registerPasskey()` takes no friendly-name
parameter either — the server names the credential — so until rename is built,
entries show whatever name GoTrue assigned, or "Passkey" when it assigned none.

An administrator can also remove another user's passkey through the admin API
(`auth.admin.passkey.deletePasskey`), which is what `e2e/passkey.spec.ts` uses to
reset the test user; there is no UI for it.

## Testing

- `__tests__/lib/passkey/ceremony-url.test.ts` — the inline/redirect rule and the
  `next` validator, which is the open-redirect surface of the feature.
- `components/__tests__/passkey-button.test.tsx` — inline vs. bounce, cancellation,
  and hiding where passkeys cannot work.
- `components/__tests__/passkey-settings.test.tsx` — the list, and delete including
  its confirmation, cancellation and failure paths.
- `e2e/passkey.spec.ts` — a real ceremony against local GoTrue using a Chromium
  CDP virtual authenticator. It must stay one linear test on one page: the
  authenticator is bound to its page target, so the resident credential vanishes
  with the page. It signs out by clearing its own `sb-` cookies rather than
  clicking Logout, because `signOut()` defaults to **global** scope and would
  revoke the shared E2E user's refresh tokens for every other spec.
