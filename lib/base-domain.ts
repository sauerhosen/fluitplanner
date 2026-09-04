/**
 * The domain whose subdomains resolve to club slugs.
 *
 * Read in several places that must agree exactly — tenant resolution, the auth
 * and the auth cookie scope — so the default lives here
 * rather than being repeated at each call site.
 */
export function getBaseDomain(): string {
  return process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "fluiten.org";
}
