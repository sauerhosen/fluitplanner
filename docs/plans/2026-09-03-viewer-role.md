# Viewer role — implementation notes

**Status:** built 2026-09-03.

`organization_members.role = 'viewer'` had been allowed by the schema since multi-tenancy
landed and was selectable in the master admin panel, but nothing enforced it: almost every
tenant table carried a members-can-do-anything policy, and only a handful of server actions
called `requirePlanner()`. This change makes the role mean what it says: a viewer sees
everything about their own club and can change nothing.

## What changed

| Layer          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database       | `20260903000001_viewer_read_only.sql`: `get_user_planner_org_ids()` helper; per-table `select` (members) / `insert`+`update`+`delete` (planners) policies on `matches`, `polls`, `poll_matches`, `poll_slots`, `assignments`, `managed_teams`, `organization_settings`, `umpires` (update/delete), `availability_responses` (delete); the members-can-do-anything policy on `verification_codes` is dropped without replacement (service role only). |
| Server actions | Every write in `matches`, `polls`, `assignments`, `poll-responses`, `featured-matches`, `umpires`, `managed-teams`, `organization-settings` now calls `requirePlanner()`. New `requireMember()` and `getMembershipRole()` in `lib/auth.ts`.                                                                                                                                                                                                          |
| UI             | `RoleProvider` + `useIsPlanner()`; mutation controls hidden or rendered inert for viewers across matches, umpires, polls, poll detail (grids, title, menus), settings, dashboard; `/protected/polls/new` redirects viewers; "Read-only" badge in the nav.                                                                                                                                                                                            |
| Admin          | Invite dialog picks a role; `invitePlanner(orgId, email, role)` stamps `app_metadata.invited_role`; `/auth/confirm` redeems it.                                                                                                                                                                                                                                                                                                                      |

## Pre-existing leaks the migration also closes

The stage-1 policies `Authenticated users can select matches` and `… select assignments` were
`USING (true)` and had never been dropped. Any signed-in user of any club could read every
club's matches and assignments straight through PostgREST with the browser key (the app's
own queries always filtered by tenant, so the UI never showed it). Both are gone; reads are
now member-scoped.

## Deliberately left open

The anonymous poll surface — `select` on `polls` / `poll_matches` / `poll_slots` /
`availability_responses` for `anon` and `authenticated`, plus response `insert`/`update` and
umpire `insert`/`select` — is unchanged. `/poll/<token>` reads and writes with the caller's own
client, so a signed-in umpire runs as `authenticated` and restricting that role below `anon`
would break them without protecting anything. Closing it means moving the public poll flow
onto the service client behind the token check; that is a separate change.

## Verifying locally

With local Supabase running, a transaction that creates a planner and a viewer in one club
and a planner in another, switches `role`/`request.jwt.claims` per user, and attempts each
write shows: viewer reads its own club and zero rows of the other; every viewer insert fails
with `42501`; every viewer update/delete matches zero rows; a planner is refused an insert
into the other club.
