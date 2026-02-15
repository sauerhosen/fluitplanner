type TenantResolution =
  | { type: "tenant"; slug: string }
  | { type: "root" }
  | { type: "fallback" };

const VALID_SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

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
    if (VALID_SLUG.test(slug)) return { type: "tenant", slug };
    return { type: "fallback" };
  }

  // localhost with subdomain (e.g. hic.localhost)
  if (hostWithoutPort.endsWith(".localhost")) {
    const slug = hostWithoutPort.slice(0, -".localhost".length);
    if (VALID_SLUG.test(slug)) return { type: "tenant", slug };
    return { type: "fallback" };
  }

  // localhost without subdomain, or vercel.app, etc.
  return { type: "fallback" };
}
