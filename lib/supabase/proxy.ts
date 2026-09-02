import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveTenantFromHost } from "@/lib/tenant-resolver";

const TENANT_COOKIE = "x-tenant";

function tenantCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * True on localhost and on Vercel preview/development deployments.
 *
 * Preview builds run with NODE_ENV=production, so VERCEL_ENV decides whenever
 * it is set and NODE_ENV only covers local runs.
 */
function isNonProductionEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv !== "production";
  return process.env.NODE_ENV !== "production";
}

export async function updateSession(request: NextRequest) {
  // Cron routes authenticate via CRON_SECRET, the MCP server via its own
  // bearer tokens, and the OAuth token/register/discovery endpoints are
  // public by design; all run without a user session or tenant context —
  // skip auth/tenant handling entirely. (/oauth/authorize is NOT skipped:
  // the consent page needs the session.)
  if (
    request.nextUrl.pathname.startsWith("/api/cron/") ||
    request.nextUrl.pathname === "/api/mcp" ||
    request.nextUrl.pathname.startsWith("/api/oauth/") ||
    request.nextUrl.pathname.startsWith("/.well-known/")
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Tenant resolution
  const host = request.headers.get("host") ?? "localhost:3000";
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "fluiten.org";
  const resolution = resolveTenantFromHost(host, baseDomain);

  if (resolution.type === "root") {
    // Set on request headers so server components can read via headers()
    request.headers.set("x-is-root-domain", "true");

    // Root domain users still need a tenant context for data-scoped queries,
    // and the x-tenant cookie is what selects it. That cookie is
    // client-controlled, so it only counts when the user really is a member of
    // the organization it names — otherwise fall back to their own membership
    // and rewrite the cookie. Trusting it unverified handed any signed-in user
    // a planner role in any active club (issue #151).
    if (user) {
      const cookieSlug = request.cookies.get(TENANT_COOKIE)?.value ?? null;
      let org = cookieSlug
        ? await resolveMemberOrgBySlug(supabase, user.sub, cookieSlug)
        : null;

      if (!org) {
        org = await resolveFirstMemberOrg(supabase, user.sub);
        if (org) {
          supabaseResponse.cookies.set(
            TENANT_COOKIE,
            org.slug,
            tenantCookieOptions(),
          );
        }
      }

      if (org?.is_active) {
        request.headers.set("x-organization-id", org.id);
        request.headers.set("x-organization-slug", org.slug);
      }
    }
  } else {
    let slug: string | null = null;

    if (resolution.type === "tenant") {
      slug = resolution.slug;
    } else {
      // Fallback: cookie → query param
      slug = request.cookies.get(TENANT_COOKIE)?.value ?? null;
      const paramSlug = request.nextUrl.searchParams.get("tenant");
      if (paramSlug) {
        slug = paramSlug;
        // Persist tenant cookie so subsequent requests don't need the query param
        supabaseResponse.cookies.set(
          TENANT_COOKIE,
          paramSlug,
          tenantCookieOptions(),
        );
      }
      // Auto-resolve tenant from user's membership when no cookie/param is set
      if (!slug && user) {
        const org = await resolveFirstMemberOrg(supabase, user.sub);
        if (org) {
          slug = org.slug;
          supabaseResponse.cookies.set(
            TENANT_COOKIE,
            org.slug,
            tenantCookieOptions(),
          );
        }
      }

      // Allow admin pages to be accessible in fallback mode (dev/preview)
      request.headers.set("x-is-fallback-mode", "true");
    }

    if (slug) {
      // Look up org by slug
      const { data: org } = await supabase
        .from("organizations")
        .select("id, is_active")
        .eq("slug", slug)
        .single();

      if (org) {
        if (!org.is_active) {
          return new NextResponse("Organization is inactive", { status: 403 });
        }
        // Set on request headers so server components can read via headers()
        request.headers.set("x-organization-id", org.id);
        request.headers.set("x-organization-slug", slug);
      } else if (resolution.type === "tenant") {
        // Only 404 for subdomain-based resolution (explicit tenant URL)
        // Cookie/query param fallback silently proceeds without tenant context
        return new NextResponse("Organization not found", { status: 404 });
      }
    }
  }

  // Recreate the response with the updated request headers
  // so server components can read them via headers()
  const updatedResponse = NextResponse.next({ request });
  // Copy over cookies from supabaseResponse (auth session cookies)
  // Pass the full cookie object to preserve attributes (httpOnly, secure, etc.)
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    updatedResponse.cookies.set(cookie);
  });

  // Organization membership check
  const orgId = request.headers.get("x-organization-id");
  if (user && orgId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.sub)
      .single();

    if (!membership) {
      if (resolution.type === "fallback" && isNonProductionEnvironment()) {
        // Dev/preview only: the tenant came from a cookie or ?tenant= param on
        // a host that carries no tenant of its own (localhost, *.vercel.app),
        // so join the signed-in user as a planner rather than making every
        // developer hand-seed a membership row.
        //
        // Deliberately the service role: no RLS policy lets a user insert their
        // own membership, because that policy *was* the privilege escalation in
        // issue #151. The env check is what keeps this off production — the
        // root domain resolves to `root`, never `fallback`.
        await autoJoinAsPlanner(orgId, user.sub);
      } else if (
        !request.nextUrl.pathname.startsWith("/auth") &&
        !request.nextUrl.pathname.startsWith("/poll") &&
        !request.nextUrl.pathname.startsWith("/no-access") &&
        request.nextUrl.pathname !== "/"
      ) {
        // Non-member on a tenant URL (or on a fallback host in production):
        // no data for them here.
        const url = request.nextUrl.clone();
        url.pathname = "/no-access";
        return NextResponse.redirect(url);
      }
    }
  }

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/poll") &&
    !request.nextUrl.pathname.startsWith("/no-access") &&
    !request.nextUrl.pathname.startsWith("/privacy")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/auth/login";
    url.search = "";
    // Preserve the destination so login can return there (e.g. the OAuth
    // consent page); /protected is the login form's default anyway.
    if (next !== "/protected") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the updatedResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return updatedResponse;
}

type MemberOrg = { id: string; slug: string; is_active: boolean };

/**
 * The organization with this slug, but only if the user is a member of it.
 * Used to validate the client-controlled x-tenant cookie on the root domain.
 */
async function resolveMemberOrgBySlug(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  slug: string,
): Promise<MemberOrg | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organizations!inner(id, slug, is_active)")
    .eq("user_id", userId)
    .eq("organizations.slug", slug)
    .maybeSingle();

  return (data?.organizations as unknown as MemberOrg | null) ?? null;
}

/**
 * The user's first organization membership. Used to pick a tenant when there
 * is no usable x-tenant cookie.
 */
async function resolveFirstMemberOrg(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
): Promise<MemberOrg | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organizations(id, slug, is_active)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return (data?.organizations as unknown as MemberOrg | null) ?? null;
}

/**
 * Dev/preview convenience: make the signed-in user a planner of the resolved
 * organization. Callers must have established that this is not production.
 */
async function autoJoinAsPlanner(
  organizationId: string,
  userId: string,
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[proxy] Skipping dev tenant auto-join: SUPABASE_SERVICE_ROLE_KEY is not set.",
    );
    return;
  }

  const { error } = await createServiceClient()
    .from("organization_members")
    .upsert(
      { organization_id: organizationId, user_id: userId, role: "planner" },
      { onConflict: "organization_id,user_id" },
    );

  if (error) {
    console.warn(`[proxy] Dev tenant auto-join failed: ${error.message}`);
  }
}
