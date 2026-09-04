"use server";

import { requireTenantId } from "@/lib/tenant";
import {
  getMembershipRole,
  requireAuthContext,
  requirePlanner,
} from "@/lib/auth";
import {
  isAvailabilityLockMode,
  type OrganizationSettings,
  type AvailabilityLockMode,
} from "@/lib/types/domain";

/** Check if the current user has planner role in the current org. */
export async function isPlannerRole(): Promise<boolean> {
  return (await getMembershipRole()) === "planner";
}

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const { supabase } = await requireAuthContext();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("organization_settings")
    .select("*")
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    // Return defaults if no row exists
    return {
      organization_id: tenantId,
      availability_lock_mode: "warn",
      updated_at: new Date().toISOString(),
    };
  }
  return data;
}

export async function updateAvailabilityLockMode(
  mode: AvailabilityLockMode,
): Promise<OrganizationSettings> {
  if (!isAvailabilityLockMode(mode)) throw new Error("Invalid lock mode");
  const { supabase, tenantId } = await requirePlanner();

  const { data, error } = await supabase
    .from("organization_settings")
    .upsert(
      {
        organization_id: tenantId,
        availability_lock_mode: mode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
