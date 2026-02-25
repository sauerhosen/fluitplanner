"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import {
  isAvailabilityLockMode,
  type OrganizationSettings,
  type AvailabilityLockMode,
} from "@/lib/types/domain";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/** Check if the current user has planner role in the current org. */
export async function isPlannerRole(): Promise<boolean> {
  const { supabase, user } = await requireAuth();
  const tenantId = await requireTenantId();
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.role === "planner";
}

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const { supabase } = await requireAuth();
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
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  if (!(await isPlannerRole())) {
    throw new Error("Only planners can update availability lock mode");
  }

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
