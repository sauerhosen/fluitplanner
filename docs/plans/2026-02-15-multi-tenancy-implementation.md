# Multi-Tenancy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Fluitplanner into a multi-tenant platform with subdomain-based routing, shared Supabase DB with RLS isolation, and a master admin panel.

**Architecture:** Middleware-based tenant resolution in `proxy.ts` reads the `Host` header to extract subdomain → organization slug. An `organization_id` column is added to all data tables. RLS ensures users can only access orgs they're members of. Application code filters to the specific org from the middleware header. Master admin panel lives on the root domain.

**Tech Stack:** Next.js App Router, Supabase (shared DB + RLS), next-intl, TailwindCSS v4, shadcn/ui

**Design doc:** `docs/plans/2026-02-15-multi-tenancy-design.md`

---

## Task 1: Database Migration — New Tables

**Files:**

- Create: `supabase/migrations/20260215000001_multi_tenancy_tables.sql`
- Modify: `lib/types/domain.ts`

**Step 1: Write the migration SQL**

Create the migration file with the three new tables:

```sql
-- Organizations (tenants)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  is_active boolean not null default true,
  created_at timestamptz default now() not null,
  created_by uuid references auth.users not null
);

create index idx_organizations_slug on public.organizations (slug);

-- Organization members (user-to-org mapping with role)
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete cascade not null,
  user_id uuid references auth.users not null,
  role text not null default 'planner' check (role in ('planner', 'viewer')),
  created_at timestamptz default now() not null,
  unique (organization_id, user_id)
);

create index idx_org_members_user on public.organization_members (user_id);
create index idx_org_members_org on public.organization_members (organization_id);

-- Organization umpires (umpire-to-org roster link)
create table public.organization_umpires (
  organization_id uuid references public.organizations on delete cascade not null,
  umpire_id uuid references public.umpires on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (organization_id, umpire_id)
);

-- RLS for organizations: authenticated users can read orgs they belong to
alter table public.organizations enable row level security;

create policy "Users can view their organizations"
  on public.organizations for select to authenticated
  using (
    id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

create policy "Master admins can manage all organizations"
  on public.organizations for all to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'is_master_admin')::boolean = true
  );

-- RLS for organization_members: users can see members of their own orgs
alter table public.organization_members enable row level security;

create policy "Users can view members of their organizations"
  on public.organization_members for select to authenticated
  using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

create policy "Master admins can manage all members"
  on public.organization_members for all to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'is_master_admin')::boolean = true
  );

-- RLS for organization_umpires: users can manage umpires in their orgs
alter table public.organization_umpires enable row level security;

create policy "Users can view umpires in their organizations"
  on public.organization_umpires for select to authenticated
  using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

create policy "Planners can manage umpires in their organizations"
  on public.organization_umpires for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role = 'planner'
    )
  );
```

**Step 2: Add TypeScript types**

Add to `lib/types/domain.ts`:

```typescript
export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "planner" | "viewer";
  created_at: string;
};
```

**Step 3: Run migration locally**

Run: `npx supabase db reset`
Expected: Tables created successfully, no errors.

**Step 4: Commit**

```bash
git add supabase/migrations/20260215000001_multi_tenancy_tables.sql lib/types/domain.ts
git commit -m "feat: add organizations, organization_members, organization_umpires tables"
```

---

## Task 2: Database Migration — Add organization_id to Existing Tables

**Files:**

- Create: `supabase/migrations/20260215000002_add_organization_id.sql`
- Modify: `lib/types/domain.ts`

**Step 1: Write the migration SQL**

Add nullable `organization_id` columns to existing tables. Nullable for now — Phase 3 backfill will populate them, Phase 4 makes them NOT NULL.

```sql
-- Add nullable organization_id to existing tables
alter table public.matches
  add column organization_id uuid references public.organizations;

alter table public.polls
  add column organization_id uuid references public.organizations;

alter table public.managed_teams
  add column organization_id uuid references public.organizations;

alter table public.assignments
  add column organization_id uuid references public.organizations;

alter table public.verification_codes
  add column organization_id uuid references public.organizations;

-- Indexes for the new columns
create index idx_matches_org on public.matches (organization_id);
create index idx_polls_org on public.polls (organization_id);
create index idx_managed_teams_org on public.managed_teams (organization_id);
create index idx_assignments_org on public.assignments (organization_id);
```

**Step 2: Update TypeScript types**

Add `organization_id: string | null` to `Match`, `Poll`, `ManagedTeam`, `Assignment` types in `lib/types/domain.ts`. The field is nullable during migration, will become required later.

**Step 3: Run migration locally**

Run: `npx supabase db reset`
Expected: All tables have `organization_id` column, nullable.

**Step 4: Commit**

```bash
git add supabase/migrations/20260215000002_add_organization_id.sql lib/types/domain.ts
git commit -m "feat: add nullable organization_id to matches, polls, managed_teams, assignments, verification_codes"
```

---

## Task 3: Tenant Resolution Utilities

**Files:**

- Create: `lib/tenant.ts`
- Create: `__tests__/lib/tenant.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: mockGet,
  })),
}));

describe("getTenantId", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns organization_id from x-organization-id header", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-organization-id") return "org-uuid-123";
      return null;
    });
    const { getTenantId } = await import("@/lib/tenant");
    const result = await getTenantId();
    expect(result).toBe("org-uuid-123");
  });

  it("returns null when header is not set", async () => {
    mockGet.mockReturnValue(null);
    const { getTenantId } = await import("@/lib/tenant");
    const result = await getTenantId();
    expect(result).toBeNull();
  });
});

describe("getTenantSlug", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns slug from x-organization-slug header", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-organization-slug") return "hic";
      return null;
    });
    const { getTenantSlug } = await import("@/lib/tenant");
    const result = await getTenantSlug();
    expect(result).toBe("hic");
  });
});

describe("isRootDomain", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns true when x-is-root-domain header is set", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-is-root-domain") return "true";
      return null;
    });
    const { isRootDomain } = await import("@/lib/tenant");
    const result = await isRootDomain();
    expect(result).toBe(true);
  });

  it("returns false when header is not set", async () => {
    mockGet.mockReturnValue(null);
    const { isRootDomain } = await import("@/lib/tenant");
    const result = await isRootDomain();
    expect(result).toBe(false);
  });
});

describe("requireTenantId", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns organization_id when present", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-organization-id") return "org-uuid-123";
      return null;
    });
    const { requireTenantId } = await import("@/lib/tenant");
    const result = await requireTenantId();
    expect(result).toBe("org-uuid-123");
  });

  it("throws when organization_id is not present", async () => {
    mockGet.mockReturnValue(null);
    const { requireTenantId } = await import("@/lib/tenant");
    await expect(requireTenantId()).rejects.toThrow("No tenant context");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/tenant.test.ts`
Expected: FAIL — module `@/lib/tenant` not found.

**Step 3: Write the implementation**

Create `lib/tenant.ts`:

```typescript
import { headers } from "next/headers";

/**
 * Get the current tenant's organization ID from middleware headers.
 * Returns null if no tenant context (e.g., root domain or missing header).
 */
export async function getTenantId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-organization-id");
}

/**
 * Get the current tenant's organization ID, throwing if not present.
 * Use this in server actions that require a tenant context.
 */
export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error("No tenant context");
  return tenantId;
}

/**
 * Get the current tenant's slug from middleware headers.
 */
export async function getTenantSlug(): Promise<string | null> {
  const h = await headers();
  return h.get("x-organization-slug");
}

/**
 * Check if the current request is for the root domain (master admin).
 */
export async function isRootDomain(): Promise<boolean> {
  const h = await headers();
  return h.get("x-is-root-domain") === "true";
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/tenant.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add lib/tenant.ts __tests__/lib/tenant.test.ts
git commit -m "feat: add tenant resolution utility functions"
```

---

## Task 4: Tenant Resolution Middleware

**Files:**

- Modify: `lib/supabase/proxy.ts`
- Create: `lib/tenant-resolver.ts`
- Create: `__tests__/lib/tenant-resolver.test.ts`

**Step 1: Write the failing tests for the resolver**

The resolver is a pure function (no side effects) that extracts tenant info from a hostname. We test this separately from the middleware.

```typescript
import { describe, it, expect } from "vitest";
import { resolveTenantFromHost } from "@/lib/tenant-resolver";

describe("resolveTenantFromHost", () => {
  it("extracts subdomain from production domain", () => {
    const result = resolveTenantFromHost("hic.fluiten.org", "fluiten.org");
    expect(result).toEqual({ type: "tenant", slug: "hic" });
  });

  it("returns root for the base domain", () => {
    const result = resolveTenantFromHost("fluiten.org", "fluiten.org");
    expect(result).toEqual({ type: "root" });
  });

  it("returns root for www subdomain", () => {
    const result = resolveTenantFromHost("www.fluiten.org", "fluiten.org");
    expect(result).toEqual({ type: "root" });
  });

  it("returns fallback for non-production domains (e.g. vercel.app)", () => {
    const result = resolveTenantFromHost(
      "my-project-abc123.vercel.app",
      "fluiten.org",
    );
    expect(result).toEqual({ type: "fallback" });
  });

  it("returns fallback for localhost", () => {
    const result = resolveTenantFromHost("localhost:3000", "fluiten.org");
    expect(result).toEqual({ type: "fallback" });
  });

  it("extracts subdomain from localhost with subdomain", () => {
    const result = resolveTenantFromHost("hic.localhost:3000", "fluiten.org");
    expect(result).toEqual({ type: "tenant", slug: "hic" });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/tenant-resolver.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the resolver**

Create `lib/tenant-resolver.ts`:

```typescript
type TenantResolution =
  | { type: "tenant"; slug: string }
  | { type: "root" }
  | { type: "fallback" };

export function resolveTenantFromHost(
  host: string,
  baseDomain: string,
): TenantResolution {
  // Strip port for comparison
  const hostWithoutPort = host.split(":")[0];
  const baseWithoutPort = baseDomain.split(":")[0];

  // Check if this is the production domain or a subdomain of it
  if (
    hostWithoutPort === baseWithoutPort ||
    hostWithoutPort === `www.${baseWithoutPort}`
  ) {
    return { type: "root" };
  }

  if (hostWithoutPort.endsWith(`.${baseWithoutPort}`)) {
    const slug = hostWithoutPort.slice(0, -(baseWithoutPort.length + 1));
    return { type: "tenant", slug };
  }

  // localhost with subdomain (e.g. hic.localhost)
  if (hostWithoutPort.endsWith(".localhost")) {
    const slug = hostWithoutPort.slice(0, -".localhost".length);
    return { type: "tenant", slug };
  }

  // localhost without subdomain, or vercel.app, etc.
  return { type: "fallback" };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/tenant-resolver.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add lib/tenant-resolver.ts __tests__/lib/tenant-resolver.test.ts
git commit -m "feat: add tenant resolver for host-to-slug extraction"
```

**Step 6: Integrate into proxy.ts**

Modify `lib/supabase/proxy.ts` to:

1. After `supabase.auth.getClaims()`, resolve the tenant from the `Host` header
2. For `type: "tenant"` — look up org by slug via Supabase, set `x-organization-id` and `x-organization-slug` headers
3. For `type: "root"` — set `x-is-root-domain: true` header
4. For `type: "fallback"` — check `x-tenant` cookie, then `tenant` query param. Set cookie if param present.
5. If tenant slug doesn't match any org and this isn't a public route — return 404

The proxy needs to set these headers on the `supabaseResponse` object before returning it. Use the pattern from the existing code's comments (lines 64-76 of `lib/supabase/proxy.ts`):

```typescript
// After auth check, before returning supabaseResponse:
const host = request.headers.get("host") ?? "localhost:3000";
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "fluiten.org";
const resolution = resolveTenantFromHost(host, baseDomain);

if (resolution.type === "root") {
  supabaseResponse.headers.set("x-is-root-domain", "true");
} else {
  let slug: string | null = null;

  if (resolution.type === "tenant") {
    slug = resolution.slug;
  } else {
    // Fallback: cookie then query param
    slug = request.cookies.get("x-tenant")?.value ?? null;
    const paramSlug = request.nextUrl.searchParams.get("tenant");
    if (paramSlug) {
      slug = paramSlug;
      supabaseResponse.cookies.set("x-tenant", paramSlug, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  if (slug) {
    // Look up org by slug
    const { data: org } = await supabase
      .from("organizations")
      .select("id, is_active")
      .eq("slug", slug)
      .single();

    if (!org) {
      return new NextResponse("Organization not found", { status: 404 });
    }
    if (!org.is_active) {
      return new NextResponse("Organization is inactive", { status: 403 });
    }

    supabaseResponse.headers.set("x-organization-id", org.id);
    supabaseResponse.headers.set("x-organization-slug", slug);
  }
  // If no slug resolved on fallback, tenant context is missing.
  // Public routes (/, /auth, /poll) can proceed without it.
  // Protected routes will fail at requireTenantId() in server actions.
}
```

Add `NEXT_PUBLIC_BASE_DOMAIN` to `.env.example` and `.env.local`.

**Step 7: Run the dev server and verify**

Run: `npm run dev`

- Visit `localhost:3000` — should work as before (fallback mode, no tenant)
- Visit `localhost:3000?tenant=test` — should set cookie (org won't exist yet, that's OK — the 404 is expected)

**Step 8: Commit**

```bash
git add lib/supabase/proxy.ts .env.example
git commit -m "feat: integrate tenant resolution into proxy middleware"
```

---

## Task 5: Update Server Actions — Add organization_id to Writes

**Files:**

- Modify: `lib/actions/matches.ts`
- Modify: `lib/actions/polls.ts`
- Modify: `lib/actions/umpires.ts`
- Modify: `lib/actions/assignments.ts`
- Modify: `lib/actions/dashboard.ts`
- Modify: `lib/actions/public-polls.ts`

This task updates all write operations to include `organization_id` and all read operations to filter by `organization_id`. This is the largest task.

**Step 1: Update `matches.ts`**

Import `requireTenantId` from `@/lib/tenant`.

For each function:

- `getMatches()`: add `.eq("organization_id", await requireTenantId())` to the query
- `createMatch()`: add `organization_id: await requireTenantId()` to the insert object
- `updateMatch()`: no change needed (updates by `id`, RLS handles scoping)
- `deleteMatch()`: no change needed (deletes by `id`, RLS handles scoping)
- `upsertMatches()`: add `organization_id` to each row in the upsert array

**Step 2: Update `polls.ts`**

Import `requireTenantId` from `@/lib/tenant`.

For each function:

- `getPolls()`: replace `.eq("created_by", user.id)` with `.eq("organization_id", await requireTenantId())`
- `getPoll()`: add `.eq("organization_id", await requireTenantId())`
- `createPoll()`: add `organization_id: await requireTenantId()` to the insert
- Other read functions scoped by poll_id: the poll itself is org-scoped, so downstream data (slots, responses) is already correctly scoped via FK

**Step 3: Update `umpires.ts`**

Umpires are global, but the roster is org-scoped. This requires a different approach:

- `getUmpires()`: instead of selecting all umpires, join through `organization_umpires` to get only this org's roster
- `createUmpire()`: after inserting into `umpires` (or finding existing by email), also insert into `organization_umpires`
- `deleteUmpire()`: delete from `organization_umpires` (not from `umpires` — the umpire may be on other orgs' rosters)

```typescript
export async function getUmpires(): Promise<Umpire[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Get umpire IDs for this org
  const { data: roster, error: rosterError } = await supabase
    .from("organization_umpires")
    .select("umpire_id")
    .eq("organization_id", tenantId);

  if (rosterError) throw new Error(rosterError.message);
  if (!roster || roster.length === 0) return [];

  const umpireIds = roster.map((r) => r.umpire_id);

  const { data, error } = await supabase
    .from("umpires")
    .select("*")
    .in("id", umpireIds)
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}
```

**Step 4: Update `assignments.ts`**

- `createAssignment()`: add `organization_id: await requireTenantId()` to the insert
- Read functions: scoped via poll_id which is already org-scoped

**Step 5: Update `dashboard.ts`**

Replace all `.eq("created_by", user.id)` with `.eq("organization_id", await requireTenantId())`.

**Step 6: Update `public-polls.ts`**

Import `getTenantId` (not `requireTenantId` — anonymous access).

- `getPollByToken()`: add `.eq("organization_id", tenantId)` if tenant context is available. Poll tokens are unique UUIDs so this is an extra safety filter, not strictly required.

**Step 7: Run existing tests**

Run: `npm test`
Expected: Some tests may fail due to the new `requireTenantId()` call. Update test mocks to include the `x-organization-id` header mock. In each test file that mocks `next/headers`, add:

```typescript
vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));
```

**Step 8: Run all tests and type-check**

Run: `npm test && npm run type-check`
Expected: All pass.

**Step 9: Commit**

```bash
git add lib/actions/ __tests__/
git commit -m "feat: add organization_id scoping to all server actions"
```

---

## Task 6: Data Backfill Migration

**Files:**

- Create: `supabase/migrations/20260215000003_backfill_default_org.sql`

**Step 1: Write the backfill migration**

This migration creates a default organization and backfills all existing data. It should be run after the app code is deployed (Task 5) so new rows already have `organization_id`.

```sql
-- Create default organization for existing data
-- The created_by should be set to the existing user's ID.
-- We grab the first authenticated user as the owner.
do $$
declare
  default_org_id uuid := gen_random_uuid();
  first_user_id uuid;
begin
  -- Find the first user who has created data
  select created_by into first_user_id from public.matches limit 1;

  -- If no matches exist, try polls
  if first_user_id is null then
    select created_by into first_user_id from public.polls limit 1;
  end if;

  -- If still no user, skip backfill (fresh install)
  if first_user_id is null then
    return;
  end if;

  -- Create default org
  insert into public.organizations (id, name, slug, created_by)
  values (default_org_id, 'Default', 'default', first_user_id);

  -- Add user as planner
  insert into public.organization_members (organization_id, user_id, role)
  values (default_org_id, first_user_id, 'planner');

  -- Backfill organization_id on all tables
  update public.matches set organization_id = default_org_id where organization_id is null;
  update public.polls set organization_id = default_org_id where organization_id is null;
  update public.managed_teams set organization_id = default_org_id where organization_id is null;
  update public.assignments set organization_id = default_org_id where organization_id is null;
  update public.verification_codes set organization_id = default_org_id where organization_id is null;

  -- Link all existing umpires to default org
  insert into public.organization_umpires (organization_id, umpire_id)
  select default_org_id, id from public.umpires;
end $$;
```

**Step 2: Run migration locally**

Run: `npx supabase db reset`
Expected: No errors. If there's existing local data, it should be backfilled.

**Step 3: Commit**

```bash
git add supabase/migrations/20260215000003_backfill_default_org.sql
git commit -m "feat: backfill default organization for existing data"
```

---

## Task 7: Enforce NOT NULL Constraints and Update RLS

**Files:**

- Create: `supabase/migrations/20260215000004_enforce_org_constraints.sql`

**Step 1: Write the migration**

```sql
-- Verify no NULLs remain (will fail if backfill was incomplete)
do $$
begin
  if exists (select 1 from public.matches where organization_id is null) then
    raise exception 'matches table has NULL organization_id values';
  end if;
  if exists (select 1 from public.polls where organization_id is null) then
    raise exception 'polls table has NULL organization_id values';
  end if;
  if exists (select 1 from public.managed_teams where organization_id is null) then
    raise exception 'managed_teams table has NULL organization_id values';
  end if;
  if exists (select 1 from public.assignments where organization_id is null) then
    raise exception 'assignments table has NULL organization_id values';
  end if;
  if exists (select 1 from public.verification_codes where organization_id is null) then
    raise exception 'verification_codes table has NULL organization_id values';
  end if;
end $$;

-- Make organization_id NOT NULL
alter table public.matches alter column organization_id set not null;
alter table public.polls alter column organization_id set not null;
alter table public.managed_teams alter column organization_id set not null;
alter table public.assignments alter column organization_id set not null;
alter table public.verification_codes alter column organization_id set not null;

-- Update match natural key constraint
-- Drop old constraint and create new one with organization_id
alter table public.matches drop constraint if exists matches_date_home_team_away_team_created_by_key;
alter table public.matches add constraint matches_date_home_team_away_team_org_key
  unique (date, home_team, away_team, organization_id);

-- Update RLS policies for tenant isolation
-- Matches: authenticated users can only access their org's matches
drop policy if exists "Authenticated users can CRUD own matches" on public.matches;
create policy "Tenant isolation for matches"
  on public.matches for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Polls: authenticated users can only access their org's polls
drop policy if exists "Authenticated users can CRUD own polls" on public.polls;
create policy "Tenant isolation for polls"
  on public.polls for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Managed teams: tenant isolation
drop policy if exists "Authenticated users can CRUD own managed teams" on public.managed_teams;
create policy "Tenant isolation for managed_teams"
  on public.managed_teams for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Assignments: tenant isolation
drop policy if exists "Only poll creator can insert assignments" on public.assignments;
drop policy if exists "Only poll creator can delete assignments" on public.assignments;
create policy "Tenant isolation for assignments"
  on public.assignments for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Keep anon policies for public poll access (token-based, unchanged)
```

**Step 2: Update TypeScript types**

In `lib/types/domain.ts`, change `organization_id: string | null` to `organization_id: string` on all types.

**Step 3: Run migration locally**

Run: `npx supabase db reset`
Expected: No errors.

**Step 4: Run type-check and tests**

Run: `npm run type-check && npm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add supabase/migrations/20260215000004_enforce_org_constraints.sql lib/types/domain.ts
git commit -m "feat: enforce NOT NULL organization_id, update RLS policies for tenant isolation"
```

---

## Task 8: Master Admin Server Actions

**Files:**

- Create: `lib/actions/admin.ts`
- Create: `__tests__/lib/actions/admin.test.ts`

**Step 1: Write the failing tests**

Test `requireMasterAdmin()`, `getOrganizations()`, `createOrganization()`, `updateOrganization()`, `invitePlanner()`.

Key patterns:

- `requireMasterAdmin()` checks `user.user_metadata.is_master_admin === true`
- Mock Supabase client with chainable pattern (same as existing tests)
- `createOrganization()` validates slug format (lowercase, alphanumeric, hyphens)
- `invitePlanner()` creates an `organization_members` record and sends invite email

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/actions/admin.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement admin actions**

Create `lib/actions/admin.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isRootDomain } from "@/lib/tenant";
import type { Organization } from "@/lib/types/domain";

async function requireMasterAdmin() {
  const rootDomain = await isRootDomain();
  if (!rootDomain) throw new Error("Not on root domain");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!user.user_metadata?.is_master_admin)
    throw new Error("Not a master admin");
  return { supabase, user };
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export async function getOrganizations(): Promise<Organization[]> {
  const { supabase } = await requireMasterAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createOrganization(
  name: string,
  slug: string,
): Promise<Organization> {
  const { supabase, user } = await requireMasterAdmin();

  if (!SLUG_REGEX.test(slug) || slug.length < 2) {
    throw new Error(
      "Invalid slug: must be lowercase alphanumeric with hyphens, at least 2 characters",
    );
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, slug, created_by: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateOrganization(
  id: string,
  updates: { name?: string; is_active?: boolean },
): Promise<Organization> {
  const { supabase } = await requireMasterAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function invitePlanner(
  organizationId: string,
  email: string,
): Promise<void> {
  const { supabase } = await requireMasterAdmin();
  const serviceClient = createServiceClient();

  // Check if user already exists
  const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  if (existingUser) {
    // Add to org directly
    const { error } = await supabase.from("organization_members").insert({
      organization_id: organizationId,
      user_id: existingUser.id,
      role: "planner",
    });
    if (error) throw new Error(error.message);
  } else {
    // Invite via Supabase auth (sends magic link)
    const { error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: { invited_to_org: organizationId },
    });
    if (error) throw new Error(error.message);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/actions/admin.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add lib/actions/admin.ts __tests__/lib/actions/admin.test.ts
git commit -m "feat: add master admin server actions for org and user management"
```

---

## Task 9: Master Admin UI — Organizations Page

**Files:**

- Create: `app/protected/organizations/page.tsx`
- Create: `components/admin/organization-list.tsx`
- Create: `components/admin/create-organization-dialog.tsx`
- Modify: `messages/en.json` (add `admin` namespace)
- Modify: `messages/nl.json` (add `admin` namespace)

**Step 1: Add i18n messages**

Add an `"admin"` namespace to both `messages/en.json` and `messages/nl.json` with keys for:

- `organizations`, `createOrganization`, `name`, `slug`, `active`, `inactive`, `invitePlanner`, `email`, `noOrganizations`, `slugHelp`, `confirmDisable`

**Step 2: Build the organizations page**

The page at `/protected/organizations` is a server component that:

- Calls `isRootDomain()` — if not on root domain, redirect to `/protected`
- Calls `getOrganizations()` to fetch all orgs
- Renders `OrganizationList` with create/edit/disable actions

Follow the existing patterns in `app/protected/matches/page.tsx` and `app/protected/umpires/page.tsx` for layout, empty states, and action dialogs.

**Step 3: Build the create organization dialog**

Client component with shadcn `Dialog`, form fields for name and slug. Slug auto-generated from name (lowercase, spaces→hyphens). Validates slug format before submission.

**Step 4: Add nav link for master admin**

Modify `app/protected/layout.tsx` to conditionally show "Organizations" link when `isRootDomain()` returns true.

**Step 5: Run type-check and dev server**

Run: `npm run type-check && npm run dev`
Expected: No errors. Visit `localhost:3000/protected/organizations` — should render (may redirect if not root domain context).

**Step 6: Commit**

```bash
git add app/protected/organizations/ components/admin/ messages/ app/protected/layout.tsx
git commit -m "feat: add master admin organizations page with create/edit/disable"
```

---

## Task 10: Organization Membership Check in Middleware

**Files:**

- Modify: `lib/supabase/proxy.ts`

**Step 1: Add membership verification**

After resolving the tenant and looking up the org, if the user is authenticated and on a subdomain (not root), verify they are a member of that org:

```typescript
// After org lookup, if user is authenticated and on a tenant subdomain:
if (user && org) {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", user.sub)
    .single();

  if (
    !membership &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/poll") &&
    request.nextUrl.pathname !== "/"
  ) {
    // User is logged in but not a member of this org
    const url = request.nextUrl.clone();
    url.pathname = "/no-access";
    return NextResponse.redirect(url);
  }
}
```

**Step 2: Create a `/no-access` page**

Create `app/no-access/page.tsx` — a simple page that says "You don't have access to this organization" with a link to log out or go back.

**Step 3: Test manually**

Run: `npm run dev`

- Log in on `localhost:3000` with the test user
- Set `?tenant=nonexistent` — should get 404
- Set `?tenant=default` (after backfill) — should work if user is a member

**Step 4: Commit**

```bash
git add lib/supabase/proxy.ts app/no-access/
git commit -m "feat: add organization membership check in middleware"
```

---

## Task 11: Handle Invited User Auto-Join

**Files:**

- Modify: `app/auth/confirmation/route.ts` (or wherever the auth callback handles post-signup)

**Step 1: Add post-signup org membership**

When a user signs up via an invite (from `invitePlanner` in Task 8), their `user_metadata` contains `invited_to_org`. After email confirmation, automatically insert them into `organization_members`:

```typescript
// After confirming the user's email/session:
const user = session.user;
if (user.user_metadata?.invited_to_org) {
  const serviceClient = createServiceClient();
  await serviceClient.from("organization_members").insert({
    organization_id: user.user_metadata.invited_to_org,
    user_id: user.id,
    role: "planner",
  });

  // Clear the metadata so it doesn't re-trigger
  await serviceClient.auth.admin.updateUserById(user.id, {
    user_metadata: { invited_to_org: null },
  });
}
```

**Step 2: Test the invite flow manually**

1. On root domain, create an org
2. Invite a new email as planner
3. Check the email, click the invite link
4. Sign up → should be auto-added to the org
5. Visit the org's subdomain → should have access

**Step 3: Commit**

```bash
git add app/auth/
git commit -m "feat: auto-join organization on invite signup"
```

---

## Task 12: Master Admin UI — Users Page

**Files:**

- Create: `app/protected/users/page.tsx`
- Create: `components/admin/user-list.tsx`
- Create: `components/admin/invite-planner-dialog.tsx`

**Step 1: Build the users page**

Server component at `/protected/users` (root domain only):

- Lists all users across all organizations
- Shows which orgs each user belongs to and their role
- Actions: invite to org, remove from org, change role

**Step 2: Build the invite dialog**

Client component with org selector (dropdown of all orgs) and email input.

**Step 3: Add nav link**

Add "Users" link to the nav in `app/protected/layout.tsx`, visible only on root domain.

**Step 4: Run type-check**

Run: `npm run type-check`
Expected: No errors.

**Step 5: Commit**

```bash
git add app/protected/users/ components/admin/ app/protected/layout.tsx
git commit -m "feat: add master admin users page with invite and role management"
```

---

## Task 13: E2E Test Updates

**Files:**

- Modify: `e2e/*.spec.ts`
- Modify: `playwright.config.ts`

**Step 1: Update E2E test setup**

All E2E tests need tenant context. Update the Playwright config or global setup to set the `x-tenant` cookie:

```typescript
// In e2e/global-setup.ts or test fixtures:
// Set x-tenant cookie to "default" for all tests
await page.context().addCookies([
  {
    name: "x-tenant",
    value: "default",
    domain: "localhost",
    path: "/",
  },
]);
```

**Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All existing tests pass with tenant cookie set.

**Step 3: Add multi-tenant E2E test**

Write a basic E2E test that:

1. Visits root domain (no tenant cookie) → sees landing page
2. Sets tenant cookie → can access protected pages

**Step 4: Commit**

```bash
git add e2e/ playwright.config.ts
git commit -m "test: update E2E tests for multi-tenant context"
```

---

## Task 14: Environment & DNS Configuration

**Files:**

- Modify: `.env.example`
- Create: `docs/deployment/multi-tenancy.md` (only if user requests)

**Step 1: Update environment variables**

Add to `.env.example`:

```
NEXT_PUBLIC_BASE_DOMAIN=fluiten.org
```

For local dev in `.env.local`:

```
NEXT_PUBLIC_BASE_DOMAIN=localhost:3000
```

**Step 2: Vercel configuration**

On Vercel dashboard:

1. Add `*.fluiten.org` as a wildcard domain
2. Add `fluiten.org` as the root domain
3. Set `NEXT_PUBLIC_BASE_DOMAIN=fluiten.org` as environment variable

**Step 3: DNS configuration**

Add these DNS records:

- `A` record: `fluiten.org` → Vercel IP
- `CNAME` record: `*.fluiten.org` → `cname.vercel-dns.com`

**Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add NEXT_PUBLIC_BASE_DOMAIN to env config"
```

---

## Task 15: Final Verification

**Step 1: Run full test suite**

Run: `npm test && npm run type-check && npm run lint && npm run build`
Expected: All pass.

**Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All pass.

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Visit `localhost:3000` — landing page (root domain context)
3. Visit `localhost:3000?tenant=default` — sets cookie, redirects to login
4. Log in → dashboard works, scoped to default org
5. Create a match, poll, umpire — all have `organization_id` set
6. Visit `localhost:3000/protected/organizations` (without tenant cookie, root domain) — master admin page

**Step 4: Create PR**

```bash
git push -u origin feat/multi-tenancy
gh pr create --title "feat: multi-tenant platform with subdomain routing" --body "..."
```
