import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";

/** Authenticated request context: fresh per-request Supabase client + user. */
export async function requireAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/**
 * Planner gate for server actions: authenticates, resolves the tenant, and
 * checks the membership role — one auth round trip and one membership query.
 * Throws the NOT_PLANNER sentinel for non-planners.
 */
export async function requirePlanner() {
  const { supabase, user } = await requireAuthContext();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.role !== "planner") throw new Error("NOT_PLANNER");

  return { supabase, user, tenantId };
}
