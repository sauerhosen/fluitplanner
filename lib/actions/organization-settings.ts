"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type {
  OrganizationSettings,
  AvailabilityLockMode,
} from "@/lib/types/domain";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("organization_settings")
    .select("*")
    .eq("organization_id", tenantId)
    .single();

  if (error || !data) {
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
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

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
