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

/** Cookie options the proxy handed to `createServerClient` on the last run. */
let capturedCookieOptions: Record<string, unknown> | undefined;

/**
 * Auth cookies a simulated token refresh writes during `getClaims()`. Empty by
 * default: most requests arrive with a valid access token and write nothing.
 */
let refreshWrites: { name: string; value: string }[] = [];

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookieOptions?: Record<string, unknown>;
      cookies: {
        setAll: (
          c: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
        ) => void;
      };
    },
  ) => {
    capturedCookieOptions = options.cookieOptions;
    const client = makeClient("user");
    return {
      ...client,
      auth: {
        getClaims: async () => {
          // @supabase/ssr writes refreshed auth cookies through setAll during
          // the session refresh that getClaims triggers.
          if (refreshWrites.length > 0) {
            options.cookies.setAll(
              refreshWrites.map(({ name, value }) => ({
                name,
                value,
                options: { path: "/", ...(options.cookieOptions ?? {}) },
              })),
            );
          }
          return client.auth.getClaims();
        },
      },
    };
  },
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
  capturedCookieOptions = undefined;
  refreshWrites = [];
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

/**
 * A session created on the root domain has to be valid on every club subdomain,
 * so the auth cookie is scoped to the base domain rather than the host. See
 * `lib/supabase/cookie-domain.ts`.
 */
describe("auth cookie scope", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "production";
    memberships = [{ id: "m-1", organization_id: ORG_A.id, user_id: "user-1" }];
  });

  it("widens the auth cookie to the base domain on a club subdomain", async () => {
    await runProxy(
      makeRequest("https://aaa.fluiten.org/protected", "aaa.fluiten.org"),
    );

    expect(capturedCookieOptions).toMatchObject({
      domain: ".fluiten.org",
      secure: true,
    });
  });

  it("widens it on the root domain too", async () => {
    await runProxy(makeRequest("https://fluiten.org/protected", "fluiten.org"));

    expect(capturedCookieOptions).toMatchObject({ domain: ".fluiten.org" });
  });

  // e2e/global-setup.ts seeds a host-only cookie and the whole suite depends on
  // that scope, so localhost must stay host-only.
  it("leaves the auth cookie host-only on localhost", async () => {
    await runProxy(
      makeRequest("http://localhost:3000/protected", "localhost:3000"),
    );

    expect(capturedCookieOptions?.domain).toBeUndefined();
    expect(capturedCookieOptions?.secure).toBeUndefined();
  });

  it("leaves it host-only on a Vercel preview host", async () => {
    await runProxy(
      makeRequest(
        "https://fp-abc123.vercel.app/protected",
        "fp-abc123.vercel.app",
      ),
    );

    expect(capturedCookieOptions?.domain).toBeUndefined();
  });

  // The x-tenant cookie selects a club. Sharing it across the base domain would
  // let one subdomain rewrite another's tenant, so it stays host-only.
  it("never puts a Domain on the x-tenant cookie", async () => {
    const { response } = await runProxy(
      makeRequest(
        "https://fluiten.org/protected",
        "fluiten.org",
        "x-tenant=bbb",
      ),
    );

    expect(response.cookies.get("x-tenant")?.value).toBe(ORG_A.slug);
    expect(response.cookies.get("x-tenant")?.domain).toBeUndefined();
  });
});

/**
 * Migration: @supabase/ssr clears the host-only counterpart only when it removes
 * cookies (signOut), not when a refresh writes one. Without the proxy stepping
 * in, a browser that signed in before the domain change keeps a stale host-only
 * cookie alongside the new one, and which of the two is read is undefined.
 */
describe("stale host-only auth cookie clearing", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.VERCEL_ENV = "production";
    memberships = [{ id: "m-1", organization_id: ORG_A.id, user_id: "user-1" }];
  });

  function hostOnlyDeletions(
    response: Awaited<ReturnType<typeof runProxy>>["response"],
  ) {
    return response.headers
      .getSetCookie()
      .filter((c) => c.includes("Max-Age=0") && !/Domain=/i.test(c));
  }

  it("deletes the host-only twin when a refresh writes a domain-scoped cookie", async () => {
    refreshWrites = [{ name: "sb-test-auth-token", value: "fresh" }];

    const { response } = await runProxy(
      makeRequest("https://aaa.fluiten.org/protected", "aaa.fluiten.org"),
    );

    const deletions = hostOnlyDeletions(response);
    expect(deletions).toHaveLength(1);
    expect(deletions[0]).toContain("sb-test-auth-token=;");
    // The replacement must still be there — deleting without replacing would
    // sign the user out.
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("fresh");
  });

  it("clears every chunk of a chunked cookie", async () => {
    refreshWrites = [
      { name: "sb-test-auth-token.0", value: "a" },
      { name: "sb-test-auth-token.1", value: "b" },
    ];

    const { response } = await runProxy(
      makeRequest("https://aaa.fluiten.org/protected", "aaa.fluiten.org"),
    );

    expect(hostOnlyDeletions(response)).toHaveLength(2);
  });

  // A session that shrinks from two chunks to one: @supabase/ssr emits a
  // host-only removal for the dropped chunk *and* a domain-scoped one for the
  // same name, and Next's name-keyed ResponseCookies keeps only the second — so
  // the host-only `.1` would survive and corrupt the next read.
  it("clears the host-only twin of a chunk the refresh dropped", async () => {
    refreshWrites = [
      { name: "sb-test-auth-token.0", value: "fresh" },
      { name: "sb-test-auth-token.1", value: "" },
    ];

    const { response } = await runProxy(
      makeRequest("https://aaa.fluiten.org/protected", "aaa.fluiten.org"),
    );

    const deletions = hostOnlyDeletions(response);
    expect(deletions).toHaveLength(2);
    expect(deletions.some((c) => c.includes("sb-test-auth-token.1=;"))).toBe(
      true,
    );
  });

  // The guard that makes this safe: with nothing written, a deletion would sign
  // the user out with no replacement.
  it("deletes nothing when no auth cookie was written", async () => {
    refreshWrites = [];

    const { response } = await runProxy(
      makeRequest("https://aaa.fluiten.org/protected", "aaa.fluiten.org"),
    );

    expect(hostOnlyDeletions(response)).toEqual([]);
  });

  it("deletes nothing when the response only removes auth cookies", async () => {
    refreshWrites = [{ name: "sb-test-auth-token", value: "" }];

    const { response } = await runProxy(
      makeRequest("https://aaa.fluiten.org/protected", "aaa.fluiten.org"),
    );

    expect(hostOnlyDeletions(response)).toEqual([]);
  });

  it("deletes nothing on a host that keeps cookies host-only anyway", async () => {
    refreshWrites = [{ name: "sb-test-auth-token", value: "fresh" }];

    const { response } = await runProxy(
      makeRequest("http://localhost:3000/protected", "localhost:3000"),
    );

    expect(hostOnlyDeletions(response)).toEqual([]);
  });
});
