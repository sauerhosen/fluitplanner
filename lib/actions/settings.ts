"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";

export type AvailabilityGuardPolicy = "warn" | "block";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

async function isPlannerInTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("user_id", userId)
    .eq("role", "planner")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getAvailabilityGuardPolicy(): Promise<AvailabilityGuardPolicy> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("organization_settings")
    .select("availability_guard_policy")
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.availability_guard_policy ?? "warn") as AvailabilityGuardPolicy;
}

export async function updateAvailabilityGuardPolicy(
  policy: AvailabilityGuardPolicy,
): Promise<void> {
  const { supabase, user } = await requireAuth();
  const tenantId = await requireTenantId();

  const canEdit = await isPlannerInTenant(supabase, tenantId, user.id);
  if (!canEdit) throw new Error("Only planners can update this setting");

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: tenantId,
      availability_guard_policy: policy,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "organization_id" },
  );

  if (error) throw new Error(error.message);
}
