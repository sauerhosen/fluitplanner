# Club admin role — design

**Status:** not started. Picked up when clubs start asking to manage their own planners.
**Depends on:** the master admin flag living in `app_metadata` (shipped 2026-08-30, migration `20260830000001_master_admin_app_metadata.sql`).

## Problem

Every planner change goes through the master admin. Adding a planner to HC Den Bosch means
someone emails the master admin, who opens `www.fluiten.org/protected/users` and invites them.
That is fine for a handful of clubs and becomes the bottleneck as soon as it is not.

## Shape of the fix

Give each club an `admin` role. A club admin manages planners **for their own club only**,
from their own subdomain. The master admin panel stays where it is for the things that are
genuinely cross-club: creating clubs, disabling clubs, deleting accounts.

|                         | Club admin                | Master admin      |
| ----------------------- | ------------------------- | ----------------- |
| Where                   | `hic.fluiten.org`         | `www.fluiten.org` |
| Invite a planner        | Their club only           | Any club          |
| Change a member's role  | Their club, up to `admin` | Any club          |
| Remove a member         | Their club only           | Any club          |
| Create / disable a club | No                        | Yes               |
| Delete an account       | No                        | Yes               |

## Schema

`organization_members.role` is currently `check (role in ('planner', 'viewer'))`
(`supabase/migrations/20260215000001_multi_tenancy_tables.sql:18`). Add `admin`:

```sql
alter table public.organization_members
  drop constraint organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('admin', 'planner', 'viewer'));
```

Then a helper mirroring `public.is_master_admin()`, so policies stay readable:

```sql
create or replace function public.is_club_admin(org_id uuid)
returns boolean
language sql
stable
security definer          -- must bypass RLS on organization_members to avoid recursion
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;
```

> `security definer` is deliberate. A policy on `organization_members` that queries
> `organization_members` recurses — this repo has already been bitten by that
> (`20260215000007_fix_recursive_rls.sql`). Keep the function's body narrow and never
> let a caller pass anything but an org id.

## RLS

`organization_members` currently has a members-can-view policy and a master-admin-can-do-all
policy. Add write access for club admins, scoped to their own club:

```sql
create policy "Club admins can manage members of their club"
  on public.organization_members for all to authenticated
  using (public.is_club_admin(organization_id))
  with check (public.is_club_admin(organization_id));
```

Two guards worth writing tests for:

1. A club admin must not be able to move a row to a **different** `organization_id` —
   that is what the `with check` clause is for. The existing master-admin policies have
   `using` but no `with check`; add one there too while you are in the file.
2. A club admin must not be able to grant themselves `is_master_admin`. They cannot —
   it lives in `app_metadata`, which is service-role-only. This is the payoff from the
   2026-08-30 migration and the reason that had to land first.

## Server actions

New file `lib/actions/club-members.ts`, deliberately separate from `lib/actions/admin.ts`
so the two authorization models never share a helper:

```ts
async function requireClubAdmin() {
  const organizationId = await requireTenantId(); // host → org, lib/tenant.ts:19
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "admin") throw new Error("Not a club admin");
  return { supabase, user, organizationId };
}
```

The org is taken from `requireTenantId()`, never from a function argument. That is the whole
point: a club admin cannot name a club they are not on.

Actions to expose: `getClubMembers()`, `inviteClubMember(email, role)`,
`updateClubMemberRole(userId, role)`, `removeClubMember(userId)`.

`inviteClubMember` reuses the existing invite mechanics from `lib/actions/admin.ts:74` —
look up the user, add the membership if they exist, otherwise `inviteUserByEmail()` plus
`app_metadata.invited_to_org`, which `app/auth/confirm/route.ts:25` already redeems.
Two things to change when lifting it:

- The invite currently hardcodes `role: "planner"`. Take the role as a parameter.
- Invites need the service role key (they touch `auth.users`), so `inviteClubMember` runs
  the service client **after** `requireClubAdmin()` has pinned the org. Pass the tenant org
  id explicitly into the insert; never let a caller supply it.

## UI

New page `app/protected/members/page.tsx`, tenant-scoped, guarded on the caller's membership
role rather than on `isRootDomain()`. The nav link appears when the current user's role in the
current club is `admin` — the layout already fetches the user (`app/protected/layout.tsx:26`)
and would need the membership role alongside it.

`components/admin/user-list.tsx` is close to what this page needs but is built around
cross-club data (`UserWithMemberships[]` with a memberships column). Build a narrower
`components/members/member-list.tsx` — one club, one role per row — rather than adding a mode
flag to the admin table.

## The master admin's way in

This is the part that does not fall out for free, and the reason this design does not replace
the master admin panel.

`getUserOrganizations()` (`lib/actions/tenant-actions.ts:22`) lists only clubs the user is a
member of, and `switchOrganization()` (`:34`) verifies membership before setting the `x-tenant`
cookie. The switcher also hides itself below two clubs (`components/organization-switcher.tsx:34`).
So a master admin who belongs to no club cannot switch into one to use the new page.

Pick one:

- **Branch both functions on `is_master_admin`** — list every active club, skip the membership
  check on switch. Smallest change, keeps the master admin out of club membership rows. The
  proxy's membership check (`lib/supabase/proxy.ts:171`) also needs the same exemption, or
  the master admin lands on `/no-access` after switching.
- **Make the master admin a real `admin` member of each club.** No code change at all, but
  every club roster then lists a person who is not part of that club, and removing them from a
  club silently removes their access.

The first is cleaner. Budget the proxy change as part of it — that redirect is easy to miss
until the switch is tested end to end.

## Out of scope

Creating and disabling clubs stays on the root domain. A club admin cannot create a club, and
account deletion stays master-admin-only because it can fail on `created_by` foreign keys
across several tables (see `deleteAuthUserWithMemberships` in `lib/actions/admin.ts`).

## Test plan

- `__tests__/lib/actions/club-members.test.ts` mirroring the mock setup in
  `__tests__/lib/actions/admin.test.ts`: rejects non-admins, rejects a member of a
  _different_ club, pins the org to the tenant rather than an argument.
- An RLS test that a club admin cannot update a membership row belonging to another club.
- E2E: club admin invites a planner on a tenant subdomain; the planner does not see the
  members page.
