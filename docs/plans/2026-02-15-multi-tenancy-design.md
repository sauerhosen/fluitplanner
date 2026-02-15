# Multi-Tenancy Design

## Overview

Transform Fluitplanner from a single-planner app into a multi-tenant platform where each club gets its own subdomain (e.g. `hic.fluiten.org`, `vvv.fluiten.org`). A master admin panel on the root domain (`fluiten.org`) manages clubs and users.

## Domain Structure

- `fluiten.org` — master admin panel + public landing page
- `*.fluiten.org` — club subdomains, one per organization
- Vercel preview deployments / localhost — use `?tenant=<slug>` query param + cookie fallback

## Tenant Resolution (Middleware)

Extend existing `proxy.ts` to resolve the tenant on every request:

1. Read `Host` header
2. **Production** (`*.fluiten.org`): extract subdomain, look up `organizations` table by slug → get `organization_id`
3. **Preview/dev** (everything else): check `x-tenant` cookie, then `?tenant=` query param. Set cookie if query param present. If neither exists, show a tenant picker.
4. **Root domain** (`fluiten.org`): set `x-is-root-domain: true` header → master admin context
5. **Unknown subdomain**: return 404

Set `x-organization-id` and `x-organization-slug` request headers for downstream consumption.

### Utility Functions

- `getTenantId()` — reads `x-organization-id` from request headers. Used in all server actions and data fetches.
- `getTenantSlug()` — reads slug for display purposes.
- `isRootDomain()` — checks if the request is on the root domain (for master admin pages). Used in conjunction with `user_metadata.is_master_admin` in `requireMasterAdmin()`.

### Supabase Client Extension

`createClient()` in `lib/supabase/server.ts` stays the same. Tenant scoping is handled in application code, not at the client level.

## Database Schema Changes

### New Tables

#### `organizations`

| Column     | Type        | Notes                                          |
| ---------- | ----------- | ---------------------------------------------- |
| id         | UUID        | PK                                             |
| name       | TEXT        | Display name (e.g. "HIC")                      |
| slug       | TEXT        | Unique, used as subdomain (e.g. "hic")         |
| is_active  | BOOLEAN     | Default true. Inactive orgs get an error page. |
| created_at | TIMESTAMPTZ |                                                |
| created_by | UUID        | FK to auth.users                               |

#### `organization_members`

| Column          | Type        | Notes                 |
| --------------- | ----------- | --------------------- |
| id              | UUID        | PK                    |
| organization_id | UUID        | FK to organizations   |
| user_id         | UUID        | FK to auth.users      |
| role            | TEXT        | 'planner' or 'viewer' |
| created_at      | TIMESTAMPTZ |                       |

Unique constraint on `(organization_id, user_id)`.

#### `organization_umpires`

| Column          | Type        | Notes               |
| --------------- | ----------- | ------------------- |
| organization_id | UUID        | FK to organizations |
| umpire_id       | UUID        | FK to umpires       |
| created_at      | TIMESTAMPTZ |                     |

PK on `(organization_id, umpire_id)`. Allows the same umpire (by email) to be on multiple clubs' rosters.

### Modified Tables

Add `organization_id` (UUID, FK to organizations) to:

- `matches`
- `polls`
- `managed_teams`
- `assignments`
- `verification_codes`

The `umpires` table stays global — no `organization_id`. Umpires are linked to orgs via `organization_umpires`.

### Constraint Changes

- Match natural key: add `organization_id` to the existing unique constraint `(date, home_team, away_team, created_by)` → `(date, home_team, away_team, organization_id)`
- `created_by` remains on all tables for audit but is no longer the primary scoping mechanism

### Master Admin

Master admins are identified by `is_master_admin: true` in Supabase auth user metadata (`raw_user_meta_data`). This is simpler than a separate roles table for a rare role.

## RLS Strategy

**Double-layer security:**

1. **RLS (security boundary):** Ensures authenticated users can only access rows belonging to organizations they're a member of. Policy pattern:

   ```sql
   CREATE POLICY "tenant_isolation" ON matches
     FOR ALL TO authenticated
     USING (
       organization_id IN (
         SELECT organization_id FROM organization_members
         WHERE user_id = auth.uid()
       )
     );
   ```

2. **Application code (correctness):** All queries add `.eq("organization_id", getTenantId())` to filter to the specific org the user is currently on.

   This means if a user belongs to two orgs, RLS allows access to both, but the app code only returns data for the current subdomain. A missed filter at worst shows the user's own other org's data — never another user's data.

**Anonymous access (public polls):** Poll tokens are globally unique UUIDs. Anon RLS stays simple (can read polls). App code filters by both token and `organization_id` from the middleware.

## Auth Flow

- Login/signup happens on the subdomain: `hic.fluiten.org/auth/login`
- After login, middleware verifies the user is a member of that org via `organization_members`
- If user is not a member → "You don't have access to this organization" error page
- Master admin login at `fluiten.org/auth/login` — checks `is_master_admin` metadata

## Master Admin Panel

**Routes (on `fluiten.org`):**

- `/` — public landing page
- `/auth/login` — master admin login
- `/protected/organizations` — CRUD organizations (name, slug, active status)
- `/protected/users` — list users across orgs, manage roles, invite planners
- `/protected/dashboard` — system-wide stats

**Organization onboarding flow:**

1. Master admin creates org (name + slug)
2. Master admin invites first planner by email
3. Planner receives invite, signs up on the subdomain
4. Planner is automatically added to `organization_members` with `role = 'planner'`

**Master admin can:**

- Create/edit/disable organizations
- Invite planners and manage user roles
- Impersonate an org via cookie-based tenant switch (for debugging)

**Master admin does NOT:**

- Manage matches, polls, or umpires directly
- See umpire availability data (privacy boundary)

## Planner Experience Changes

Mostly unchanged. Key differences:

- All queries scoped by `organization_id` instead of just `created_by`
- Multiple planners per org become possible — both see the same data
- `created_by` becomes audit metadata ("who created this")
- Umpire roster scoped via `organization_umpires` — adding an umpire by email links to existing global record if one exists

## Umpire Experience

Unchanged. Poll URLs just live on subdomains now (`hic.fluiten.org/poll/abc123`). If an umpire is on two clubs' rosters, polls live on separate subdomains.

## Migration Strategy

Phased approach to avoid downtime:

### Phase 1 — Schema additions (non-breaking)

- Create `organizations`, `organization_members`, `organization_umpires` tables
- Add nullable `organization_id` column to `matches`, `polls`, `managed_teams`, `assignments`, `verification_codes`

### Phase 2 — Deploy updated app code

- All write operations (creates, updates) now set `organization_id` on new rows
- Prevents a window where new rows are created without `organization_id`

### Phase 3 — Data backfill

- Create a default organization for the current deployment
- Backfill `organization_id` on all existing rows to this default org
- Add current user(s) to `organization_members` as planner
- Link all existing umpires to the default org via `organization_umpires`

### Phase 4 — Enforce constraints

- Verify zero NULL `organization_id` values remain
- Add NOT NULL constraint to `organization_id` columns
- Update unique constraints (e.g. match natural key)
- Update RLS policies to include org membership check

### Phase 5 — Deploy middleware

- Deploy tenant resolution in `proxy.ts`
- Configure `*.fluiten.org` wildcard DNS → Vercel
- Add master admin routes
- Existing deployment continues to work on current domain with default org

## Local Development

- Use `hic.localhost:3000` for tenant dev, `localhost:3000` for root domain
- Or use `?tenant=hic` query param fallback (no DNS config needed)
- E2E tests use `x-tenant` cookie in test setup

## Future Considerations (Not In Scope)

- Custom domains per club (e.g. `fluiten.hic.nl`)
- Self-service club signup
- Cross-org umpire availability views
- Billing per organization
