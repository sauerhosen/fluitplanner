import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression tests for the tenant auto-join in the proxy (issue #151).
 *
 * The `x-tenant` cookie is client-controlled, so it must never by itself hand a
 * signed-in user a tenant context — let alone a `planner` membership row — for
 * an organization they do not belong to.
 */

type OrgRow = { id: string; slug: string; is_active: boolean };
type MemberRow = { id: string; organization_id: string; user_id: string };

const ORG_A: OrgRow = { id: "org-a", slug: "aaa", is_active: true };
const ORG_B: OrgRow = { id: "org-b", slug: "bbb", is_active: true };

const upserts: {
  table: string;
  values: unknown;
  client: "user" | "service";
}[] = [];

let claims: { sub: string } | null = null;
let organizations: OrgRow[] = [];
let memberships: MemberRow[] = [];

/** Flatten a membership row so `.eq("organizations.slug", …)` can match it. */
function memberRows(): Record<string, unknown>[] {
  return memberships.map((m) => {
    const org = organizations.find((o) => o.id === m.organization_id) ?? null;
    return {
      ...m,
      organizations: org,
      "organizations.slug": org?.slug,
      "organizations.is_active": org?.is_active,
    };
  });
}

function tableRows(table: string): Record<string, unknown>[] {
  if (table === "organizations")
    return organizations as unknown as Record<string, unknown>[];
  if (table === "organization_members") return memberRows();
  return [];
}

/** Minimal chainable postgrest stub: `.select().eq().limit().single()`. */
function makeQuery(table: string, client: "user" | "service") {
  const filters: [string, unknown][] = [];
  let limit: number | null = null;

  const matches = () =>
    tableRows(table).filter((row) =>
      filters.every(([column, value]) => row[column] === value),
    );

  const settle = (allowEmpty: boolean) => {
    const rows = matches().slice(0, limit ?? undefined);
    if (rows.length === 0) {
      return Promise.resolve({
        data: null,
        error: allowEmpty ? null : { message: "No rows found" },
      });
    }
    return Promise.resolve({ data: rows[0], error: null });
  };

  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    limit: (n: number) => {
      limit = n;
      return query;
    },
    single: () => settle(false),
    maybeSingle: () => settle(true),
    upsert: (values: unknown) => {
      upserts.push({ table, values, client });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return query;
}

function makeClient(client: "user" | "service") {
  return {
    auth: {
      getClaims: async () => ({ data: claims ? { claims } : null }),
    },
    from: (table: string) => makeQuery(table, client),
  };
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => makeClient("user"),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => makeClient("service"),
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  hasEnvVars: true,
}));

const ORIGINAL_ENV = { ...process.env };

function makeRequest(
  url: string,
  host: string,
  cookie?: string,
  extraHeaders?: Record<string, string>,
) {
  return new NextRequest(url, {
    headers: {
      host,
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
  });
}

async function runProxy(request: NextRequest) {
  const { updateSession } = await import("@/lib/supabase/proxy");
  const response = await updateSession(request);
  return { response, request };
}

beforeEach(() => {
  upserts.length = 0;
  claims = { sub: "user-1" };
  organizations = [ORG_A, ORG_B];
  memberships = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.NEXT_PUBLIC_BASE_DOMAIN = "fluiten.org";
  delete process.env.VERCEL_ENV;
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL_ENV };
});

describe("root domain tenant resolution", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "production";
    memberships = [{ id: "m-1", organization_id: ORG_A.id, user_id: "user-1" }];
  });

  it("does not auto-join an organization named only by the x-tenant cookie", async () => {
    const { request } = await runProxy(
      makeRequest(
        "https://fluiten.org/protected",
        "fluiten.org",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(upserts).toEqual([]);
    expect(request.headers.get("x-organization-id")).not.toBe(ORG_B.id);
  });

  it("falls back to the user's own organization when the cookie names a foreign one", async () => {
    const { request, response } = await runProxy(
      makeRequest(
        "https://fluiten.org/protected",
        "fluiten.org",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(request.headers.get("x-organization-id")).toBe(ORG_A.id);
    expect(request.headers.get("x-organization-slug")).toBe(ORG_A.slug);
    expect(response.cookies.get("x-tenant")?.value).toBe(ORG_A.slug);
  });

  it("grants no tenant context when the user is a member of nothing", async () => {
    memberships = [];

    const { request } = await runProxy(
      makeRequest(
        "https://fluiten.org/protected",
        "fluiten.org",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(upserts).toEqual([]);
    expect(request.headers.get("x-organization-id")).toBeNull();
  });

  it("honours the x-tenant cookie when the user is a member of that organization", async () => {
    memberships.push({
      id: "m-2",
      organization_id: ORG_B.id,
      user_id: "user-1",
    });

    const { request } = await runProxy(
      makeRequest(
        "https://fluiten.org/protected",
        "fluiten.org",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(request.headers.get("x-organization-id")).toBe(ORG_B.id);
  });

  it("falls back past a cookie naming a deactivated club the user belongs to", async () => {
    organizations = [ORG_A, { ...ORG_B, is_active: false }];
    memberships.push({
      id: "m-2",
      organization_id: ORG_B.id,
      user_id: "user-1",
    });

    const { request, response } = await runProxy(
      makeRequest(
        "https://fluiten.org/protected",
        "fluiten.org",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(request.headers.get("x-organization-id")).toBe(ORG_A.id);
    expect(response.cookies.get("x-tenant")?.value).toBe(ORG_A.slug);
  });

  it("never picks a deactivated club as the fallback organization", async () => {
    organizations = [{ ...ORG_A, is_active: false }];
    memberships = [{ id: "m-1", organization_id: ORG_A.id, user_id: "user-1" }];

    const { request } = await runProxy(
      makeRequest("https://fluiten.org/protected", "fluiten.org"),
    );

    expect(request.headers.get("x-organization-id")).toBeNull();
  });

  it("strips tenant headers supplied by the client", async () => {
    memberships = [];

    const { request } = await runProxy(
      makeRequest("https://fluiten.org/protected", "fluiten.org", undefined, {
        "x-organization-id": ORG_B.id,
        "x-organization-slug": ORG_B.slug,
        "x-is-fallback-mode": "true",
      }),
    );

    expect(request.headers.get("x-organization-id")).toBeNull();
    expect(request.headers.get("x-organization-slug")).toBeNull();
    expect(request.headers.get("x-is-fallback-mode")).toBeNull();
  });

  it("marks the request as the root domain", async () => {
    const { request } = await runProxy(
      makeRequest("https://fluiten.org/protected", "fluiten.org"),
    );

    expect(request.headers.get("x-is-root-domain")).toBe("true");
  });
});

describe("subdomain tenant resolution", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "production";
  });

  it("redirects a non-member to /no-access without joining them", async () => {
    const { response } = await runProxy(
      makeRequest("https://bbb.fluiten.org/protected", "bbb.fluiten.org"),
    );

    expect(upserts).toEqual([]);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/no-access");
  });

  it("lets a member through", async () => {
    memberships = [{ id: "m-1", organization_id: ORG_B.id, user_id: "user-1" }];

    const { request, response } = await runProxy(
      makeRequest("https://bbb.fluiten.org/protected", "bbb.fluiten.org"),
    );

    expect(response.status).toBe(200);
    expect(request.headers.get("x-organization-id")).toBe(ORG_B.id);
  });
});

describe("fallback (cookie/query param) tenant resolution", () => {
  it("auto-joins the signed-in user outside production", async () => {
    const { request } = await runProxy(
      makeRequest(
        "http://localhost:3000/protected",
        "localhost:3000",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(request.headers.get("x-organization-id")).toBe(ORG_B.id);
    expect(upserts).toEqual([
      {
        table: "organization_members",
        client: "service",
        values: {
          organization_id: ORG_B.id,
          user_id: "user-1",
          role: "planner",
        },
      },
    ]);
  });

  it("does not auto-join in production, and redirects to /no-access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "production";

    const { response } = await runProxy(
      makeRequest(
        "https://fluitplanner.vercel.app/protected",
        "fluitplanner.vercel.app",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(upserts).toEqual([]);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/no-access");
  });

  it("auto-joins on a preview deployment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "preview";

    await runProxy(
      makeRequest(
        "https://fluitplanner-git-x.vercel.app/protected",
        "fluitplanner-git-x.vercel.app",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(upserts).toHaveLength(1);
  });

  it("does not re-join a user who is already a member", async () => {
    memberships = [{ id: "m-1", organization_id: ORG_B.id, user_id: "user-1" }];

    await runProxy(
      makeRequest(
        "http://localhost:3000/protected",
        "localhost:3000",
        `x-tenant=${ORG_B.slug}`,
      ),
    );

    expect(upserts).toEqual([]);
  });
});
