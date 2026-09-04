# Auth email flows

Every email Supabase sends on this project — invite, password reset, magic link,
signup confirmation, email change — is verified by **one** route:
[`app/auth/confirm/route.ts`](../app/auth/confirm/route.ts).

## How a link works

The email templates build the link themselves:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
```

`/auth/confirm` calls `supabase.auth.verifyOtp({ type, token_hash })`, which
redeems the token **server-side** and sets the session cookies on the response.
It then redirects to `next`.

This is the "token hash" flow. It is deliberately **not** the PKCE `?code=`
flow: PKCE stores a `code_verifier` in a cookie on the device that started the
request, so a PKCE reset link fails whenever someone opens their mail on a
different device or browser. Token hash has no such constraint.

## The rule that keeps it working

> A template that uses the stock `{{ .ConfirmationURL }}` produces a link that
> can never sign anyone in — and fails **silently**.

`{{ .ConfirmationURL }}` points at Supabase's own `/auth/v1/verify`, which
redirects back with either `?code=` (PKCE) or `#access_token=` (implicit). This
app has no handler for either: there is no `/auth/callback`, and a URL fragment
never reaches the server. The user lands on a page that quietly has no session —
which is exactly how invites, resets and magic links were all broken at once.

`__tests__/supabase/email-templates.test.ts` enforces this for the local
templates. **Nothing can enforce it for the hosted project**, so see below.

## Templates live in two places — keep them in sync

| Where                                                                             | What                | Applies to                 |
| --------------------------------------------------------------------------------- | ------------------- | -------------------------- |
| `supabase/templates/*.html` + `[auth.email.template.*]` in `supabase/config.toml` | version-controlled  | local dev only             |
| Supabase dashboard → Authentication → Emails                                      | manually maintained | **staging and production** |

The Supabase CLI does not push email templates to a hosted project. After
changing anything in `supabase/templates/`, paste the same HTML into the
dashboard for each environment, or the deployed app keeps sending stock links.

## Per-template settings

| Template             | `type=`        | `next=`                             |
| -------------------- | -------------- | ----------------------------------- |
| Invite user          | `invite`       | `/auth/update-password?type=invite` |
| Confirm signup       | `email`        | `/protected`                        |
| Reset password       | `recovery`     | `/auth/update-password`             |
| Magic link           | `magiclink`    | `/protected`                        |
| Change email address | `email_change` | `/protected`                        |

`type` is the `verifyOtp` type, and it must match or verification fails with
"Email link is invalid or has expired". Note that signup confirmation uses
`email`, not `signup`.

`next` must be a **same-site path**; `toSafeRedirectPath` in
[`lib/safe-redirect.ts`](../lib/safe-redirect.ts) rejects anything else, so a
tampered `next=` cannot turn a confirm link into an open redirect.

## Where the user lands

Links are built from `{{ .SiteURL }}`, so the whole flow completes on the
Supabase **Site URL** host, not on the club's subdomain.

That is deliberate. Supabase silently falls back to the Site URL for any
`redirect_to` that is not on the allow-list, and its globs require a path
(`https://*.fluiten.org/**` matches `https://hic.fluiten.org/auth/confirm` but
**not** the bare origin `https://hic.fluiten.org`). Building links off
`{{ .RedirectTo }}` would therefore break in a way that is invisible until a
real user clicks a real link. `{{ .SiteURL }}` always resolves.

Session cookies are host-only, so a session established on the Site URL host
does not carry over to `hic.fluiten.org`. In practice this is fine:

- An invited user accepts, sets a password, and is signed in. `/protected` on
  the root domain resolves their club from their membership.
- To use their club's own subdomain they sign in there once with the password
  they just set.

## Related settings

- **Redirect allow-list** — `additional_redirect_urls` in `supabase/config.toml`
  locally, and Authentication → URL Configuration in the dashboard.
- **`secure_password_change`** — if enabled, `updateUser({ password })` requires
  a recent login. A recovery or invite session counts as recent, so the flows
  above still work.
- **OTP expiry** — `otp_expiry` (default 1 hour) decides how long an invite or
  reset link stays valid.
