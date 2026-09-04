/**
 * Scope of the Supabase auth cookie.
 *
 * Every club lives on its own subdomain, and a host-only session cookie stops at
 * the host that set it: a sign-in on `fluiten.org` is worthless on
 * `hic.fluiten.org`. Widening the auth cookie to `Domain=.fluiten.org` makes one
 * session span the whole base domain, so signing in once covers the root surface
 * and every club the user belongs to.
 *
 * See `docs/multi-tenancy.md`.
 *
 * Only the auth cookie widens. The `x-tenant` cookie stays host-only on purpose:
 * it selects a club, and one subdomain has no business rewriting another's.
 *
 * Returns `undefined` — meaning "leave it host-only" — for anything that is not
 * the base domain or a subdomain of it: localhost, `*.vercel.app` previews, and
 * any host that merely resembles the base domain.
 */
export function sessionCookieDomain(
  host: string,
  baseDomain: string,
): string | undefined {
  const hostname = stripPort(host);
  const base = stripPort(baseDomain);
  if (!hostname || !base) return undefined;

  // Never widen on a loopback host. Local development runs over plain http and a
  // widened cookie carries `secure: true` (see below), so the browser would drop
  // every auth cookie and sign-in would stop working entirely. This matters
  // because `docs/plans/2026-02-15-multi-tenancy-implementation.md` tells
  // developers to set NEXT_PUBLIC_BASE_DOMAIN=localhost:3000 for local
  // multi-tenant work, which would otherwise land here.
  if (isLoopbackHost(hostname)) return undefined;

  if (hostname === base) return `.${base}`;
  // The dot boundary is what stops "evilfluiten.org" from being handed a cookie
  // scoped to ours.
  if (hostname.endsWith(`.${base}`)) return `.${base}`;

  return undefined;
}

function stripPort(value: string): string {
  return value.trim().toLowerCase().split(":")[0];
}

/** localhost, a loopback IP, or a `*.localhost` dev subdomain. */
function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Cookie options for the Supabase auth cookie on a given host — the single
 * source of truth the browser, server and proxy clients all use. They must
 * agree: a cookie written at one scope and cleared at another leaves a stale
 * duplicate behind, which is how "randomly logged out" bugs start.
 *
 * Supabase's defaults are host-only and carry **no** `secure` flag, so widening
 * the domain without adding one would send the session cookie to any plain-http
 * subdomain.
 */
export function authCookieOptions(
  host: string,
  baseDomain: string,
): { domain?: string; secure?: boolean } {
  const domain = sessionCookieDomain(host, baseDomain);
  return domain ? { domain, secure: true } : {};
}
