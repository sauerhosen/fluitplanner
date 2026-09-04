# Multi-tenancy

Fluitplanner serves many clubs from one deployment. A club is an `organizations` row with a
`slug`, and the slug is a **subdomain**: `hic.fluiten.org` is HIC's Fluitplanner, and a
planner working there can only ever see HIC's matches, umpires, and polls.

The original design and rollout are in
[`plans/2026-02-15-multi-tenancy-design.md`](plans/2026-02-15-multi-tenancy-design.md) and
its implementation doc; this document describes how it works today.

## Resolving a request to a club

`lib/tenant-resolver.ts` is pure and maps a `Host` header to one of three outcomes:

| Host                               | Resolution               | Meaning                                 |
| ---------------------------------- | ------------------------ | --------------------------------------- |
| `fluiten.org`, `www.fluiten.org`   | `root`                   | The master admin surface                |
| `hic.fluiten.org`, `hic.localhost` | `tenant` with slug `hic` | One specific club                       |
| `localhost:3000`, `*.vercel.app`   | `fallback`               | Dev / preview — no club in the hostname |

The base domain comes from `NEXT_PUBLIC_BASE_DOMAIN` (default `fluiten.org`). Slugs must
match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`; anything else degrades to `fallback` rather than
being trusted.

`lib/supabase/proxy.ts` then turns that into request headers that server components and
server actions read through `lib/tenant.ts`:

| Header                | Read with                                                                           |
| --------------------- | ----------------------------------------------------------------------------------- |
| `x-organization-id`   | `getTenantId()` / `requireTenantId()`                                               |
| `x-organization-slug` | `getTenantSlug()`                                                                   |
| `x-is-root-domain`    | `isRootDomain()`                                                                    |
| `x-is-fallback-mode`  | `isRootDomain()` — fallback also returns true, so admin pages stay reachable in dev |

An organization with `is_active = false` gets a 403 for the whole host — but only on the
non-root branch; on the root domain an inactive club simply yields no tenant headers. A slug
that resolves to no organization 404s, and again only for subdomain resolution, where the
URL is an explicit claim about which club this is.

## The fallback path (dev and preview)

`localhost:3000` carries no slug, so the proxy resolves the club from, in order of
precedence: a `?tenant=<slug>` query parameter (which **overrides** any cookie and is then
persisted as one), the `x-tenant` cookie, or — if neither is present — the user's first
organization membership. This is what makes `npm run dev` and Vercel preview deployments
usable without wildcard DNS, and it is why `e2e/global-setup.ts` seeds an `x-tenant` cookie
into the saved storage state.

## Auto-join, and why it is wider than it looks

When a signed-in user is not a member of the club the request resolved to, the proxy either
redirects them to `/no-access` or **auto-joins them as a planner**. Which one it does turns
on a single condition (`lib/supabase/proxy.ts:188`):

```ts
if (resolution.type !== "tenant") {
  // auto-join as planner
} else {
  // redirect to /no-access
}
```

The intent was "auto-join in dev/preview only", and the code comment there says exactly
that. It is not what the condition expresses: `!== "tenant"` is true for `fallback` **and for
`root`** — that is, for `www.fluiten.org` in production, where the club comes from the
`x-tenant` cookie. Two RLS policies widen the reach further: any authenticated user may
read any active organization by slug (`20260215000006`, added so the proxy could resolve a
tenant before membership is known), and any authenticated user may insert their own
membership row (`20260215000009`, added to let this auto-join work).

So the honest description is: on the root domain, a signed-in user whose request carries an
`x-tenant` value for a club they do not belong to is made a planner of it. **This is a known
bug, not a design decision** (issue
[#151](https://github.com/sauerhosen/fluitplanner/issues/151)) — treat the auto-join as a
dev-only affordance that is currently reachable in production, and do not build anything on
top of it. Note that the
`switchOrganization()` server action re-verifies membership properly; it is only the proxy
path that does not.

On a real club subdomain the behaviour is the intended one: non-members are redirected to
`/no-access`.

## Switching clubs

A user can belong to several clubs. `OrganizationSwitcher` in the authenticated nav calls
`switchOrganization(slug)` (`lib/actions/tenant-actions.ts`), which re-verifies membership
server-side before writing the `x-tenant` cookie. On the root domain the cookie is also what
gives a signed-in user a working tenant context for data-scoped queries.

## Roles

`organization_members.role` is `planner` | `viewer`, unique per `(organization_id, user_id)`.

- **planner** — full CRUD on the club's matches, umpires, polls, assignments, and settings
- **viewer** — sees everything the club's planners see (dashboard, matches, umpires and
  their notes, polls, responses, assignments, settings, exports) but can change nothing

The viewer role is enforced in three layers, and the UI is the least important one:

1. **RLS** (`20260903000001_viewer_read_only.sql`): tenant-owned tables allow `select` to any
   member (`get_user_org_ids()`) and `insert`/`update`/`delete` only to planners
   (`get_user_planner_org_ids()`, a `security definer` helper like its sibling so a policy on
   `organization_members` cannot recurse). A viewer's write through PostgREST with the browser
   key gets `42501` on insert and matches zero rows on update/delete.
2. **Server actions**: every mutating action calls `requirePlanner()` from `lib/auth.ts`,
   which resolves the tenant and checks the role in one query and throws the `NOT_PLANNER`
   sentinel. Reads use `requireAuthContext()` and lean on the proxy's membership check plus
   RLS; `requireMember()` is there for a read that needs the caller's role. Never re-implement
   the check inline.
3. **UI**: `app/protected/layout.tsx` reads the role once with `getMembershipRole()`, shows a
   "Read-only" badge in the nav for viewers, and provides the role through
   `components/shared/role-provider.tsx`. Client components call `useIsPlanner()` and do not
   render create/edit/delete controls for viewers; grids render as inert data. Server pages
   that render an action button (polls list) or are themselves a write (`/protected/polls/new`
   redirects) use `getMembershipRole()` directly. Hiding a control is a courtesy, not a
   security boundary — layers 1 and 2 are.

The master admin picks the role when inviting someone (`invitePlanner(orgId, email, role)`
stamps `app_metadata.invited_role` next to `invited_to_org`; `/auth/confirm` redeems both) and
can change it later from `/protected/users`. The MCP server and OAuth consent are planner-only
(`lib/mcp/auth.ts`, `lib/actions/oauth-consent.ts`), so a viewer cannot connect an AI
assistant to the club.

What a viewer can still reach that is worth knowing about:

- **Exports** (day sheets, XLSX/HTML/Markdown) are generated client-side from data the viewer
  can read anyway, so they stay available.
- **The anonymous poll surface** is untouched: `polls`, `poll_matches`, `poll_slots` and
  `availability_responses` keep their `anon`/`authenticated` `select` policies and the
  response `insert`/`update` policies, and `umpires` keeps its open `insert`, because
  `/poll/<token>` reads and writes with the caller's own client and filters by token in the
  query. A signed-in viewer filling in a poll
  as an umpire therefore still works. Tightening that surface means moving the public poll
  flow onto the service client first.

An `admin` role that would let a club manage its own planners is designed but **not built** —
see [`plans/2026-08-30-club-admin-role-design.md`](plans/2026-08-30-club-admin-role-design.md).

### Master admin

Master admin is deliberately _not_ a row in `organization_members`. It is
`app_metadata.is_master_admin` on the auth user, which only the service role key can write —
unlike `user_metadata`, which the user can write themselves. Migration
`20260830000001_master_admin_app_metadata.sql` moved the flag there, retired the old
user-metadata claim to an auditable non-authoritative key, and added
`public.is_master_admin()` so RLS policies spell the check once.

Master admin pages (`/protected/organizations`, `/protected/users`) require **both** the flag
and the root domain (`requireMasterAdmin()` in `lib/actions/admin.ts`). They cover the
genuinely cross-club things: creating and deactivating clubs, inviting planners, and
disabling or deleting accounts.

Inviting a planner who has no account uses Supabase's invite mail and stamps
`app_metadata.invited_to_org`; `/auth/confirm` redeems that into a membership.

## Scoping data

Tenant-owned tables carry an `organization_id` column (`matches`, `polls`, `managed_teams`,
`assignments`, `verification_codes`, and the later `tracked_teams` / `hockey_sync_state` /
MCP and OAuth tables), and access to them is belt-and-braces:

1. **RLS** policies restrict rows to the caller's memberships (and, where relevant, to the `planner` role)
2. **Explicit filters** — every query also carries `.eq("organization_id", tenantId)`

The second is not redundant. Anything running on the service-role client — the Hockey.nl
sync, the MCP server, OAuth, the admin actions — bypasses RLS entirely, so the explicit
filter is the only thing standing between two clubs. Treat `createServiceClient()` without an
`organization_id` filter on a tenant-owned table as a bug.

Umpires are the exception: they are linked to clubs through the `organization_umpires` join
table rather than a column, so the same person can be on more than one club's roster.

## Testing

- `__tests__/lib/tenant-resolver.test.ts` — host → resolution, including invalid slugs and `.localhost`
- `__tests__/lib/actions/` — server actions assert their tenant scoping
- E2E runs in fallback mode against local Supabase, with the `x-tenant` cookie from `e2e/global-setup.ts`
