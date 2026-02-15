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
