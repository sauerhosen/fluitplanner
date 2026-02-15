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
