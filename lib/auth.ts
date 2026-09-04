import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTenantId, requireTenantId } from "@/lib/tenant";
import type { MemberRole } from "@/lib/types/domain";

/** Authenticated request context: fresh per-request Supabase client + user. */
export async function requireAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

async function lookupRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tenantId: string,
): Promise<MemberRole | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as MemberRole | undefined) ?? null;
}

/**
 * Member gate: authenticates, resolves the tenant, and returns the caller's
 * role in it — one auth round trip and one membership query. Throws the
 * NOT_MEMBER sentinel for non-members. Use it for reads any club member may
 * perform; writes go through `requirePlanner()`.
 */
export async function requireMember() {
  const { supabase, user } = await requireAuthContext();
  const tenantId = await requireTenantId();
  const role = await lookupRole(supabase, user.id, tenantId);
  if (!role) throw new Error("NOT_MEMBER");
  return { supabase, user, tenantId, role };
}

/**
 * Planner gate for server actions: authenticates, resolves the tenant, and
 * checks the membership role — one auth round trip and one membership query.
 * Throws the NOT_PLANNER sentinel for non-planners, viewers included.
 */
export async function requirePlanner() {
  const { supabase, user } = await requireAuthContext();
  const tenantId = await requireTenantId();
  const role = await lookupRole(supabase, user.id, tenantId);
  if (role !== "planner") throw new Error("NOT_PLANNER");
  return { supabase, user, tenantId };
}

/**
 * The caller's role in the current club, for role-aware rendering. Null when
 * signed out, outside a tenant context (root domain without a club cookie),
 * not a member, or when the membership lookup itself fails — a page must
 * degrade to read-only rather than crash on a transient DB error, since the
 * protected layout awaits this for every route. Never throws.
 *
 * Memoised per request with React `cache()`: the layout, the page and its
 * Suspense loaders all ask for the role, and without this each call would
 * pay its own auth round trip plus membership query.
 */
export const getMembershipRole = cache(async (): Promise<MemberRole | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const tenantId = await getTenantId();
  if (!tenantId) return null;
  try {
    return await lookupRole(supabase, user.id, tenantId);
  } catch (err) {
    console.error("getMembershipRole: membership lookup failed", err);
    return null;
  }
});
