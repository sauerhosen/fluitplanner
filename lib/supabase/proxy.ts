import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { resolveTenantFromHost } from "@/lib/tenant-resolver";

export async function updateSession(request: NextRequest) {
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

    // Still resolve tenant for root domain users so dashboard/actions work
    // Root domain users need a tenant context for data-scoped queries
    if (user) {
      let slug = request.cookies.get("x-tenant")?.value ?? null;
      if (!slug) {
        const resolvedSlug = await resolveSlugFromMembership(
          supabase,
          user.sub,
        );
        if (resolvedSlug) {
          slug = resolvedSlug;
          supabaseResponse.cookies.set("x-tenant", resolvedSlug, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        }
      }
      if (slug) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id, is_active")
          .eq("slug", slug)
          .single();
        if (org?.is_active) {
          request.headers.set("x-organization-id", org.id);
          request.headers.set("x-organization-slug", slug);
        }
      }
    }
  } else {
    let slug: string | null = null;

    if (resolution.type === "tenant") {
      slug = resolution.slug;
    } else {
      // Fallback: cookie → query param
      slug = request.cookies.get("x-tenant")?.value ?? null;
      const paramSlug = request.nextUrl.searchParams.get("tenant");
      if (paramSlug) {
        slug = paramSlug;
        // Persist tenant cookie so subsequent requests don't need the query param
        supabaseResponse.cookies.set("x-tenant", paramSlug, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }
      // Auto-resolve tenant from user's membership when no cookie/param is set
      if (!slug && user) {
        const resolvedSlug = await resolveSlugFromMembership(
          supabase,
          user.sub,
        );
        if (resolvedSlug) {
          slug = resolvedSlug;
          supabaseResponse.cookies.set("x-tenant", resolvedSlug, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
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
      if (resolution.type !== "tenant") {
        // Cookie/query param fallback (dev/preview): auto-join the user as planner
        // so RLS policies work correctly. Safe because this path is only used
        // in dev/preview environments (not production subdomain routing).
        await supabase
          .from("organization_members")
          .upsert(
            { organization_id: orgId, user_id: user.sub, role: "planner" },
            { onConflict: "organization_id,user_id" },
          );
      } else if (
        !request.nextUrl.pathname.startsWith("/auth") &&
        !request.nextUrl.pathname.startsWith("/poll") &&
        !request.nextUrl.pathname.startsWith("/no-access") &&
        request.nextUrl.pathname !== "/"
      ) {
        // Subdomain-based resolution: redirect non-members to /no-access
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
    url.pathname = "/auth/login";
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

/**
 * Look up the user's first organization membership and return its slug.
 * Used in fallback mode to auto-resolve tenant when no cookie/param is set.
 */
async function resolveSlugFromMembership(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organizations(slug)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const org = data.organizations as unknown as { slug: string } | null;
  return org?.slug ?? null;
}
