"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type { ManagedTeam } from "@/lib/types/domain";

export async function getManagedTeams(): Promise<ManagedTeam[]> {
  const supabase = await createClient();
  const tenantId = await requireTenantId();
  const { data, error } = await supabase
    .from("managed_teams")
    .select("*")
    .eq("organization_id", tenantId)
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createManagedTeam(
  name: string,
  requiredLevel: 1 | 2 | 3,
): Promise<ManagedTeam> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("managed_teams")
    .insert({
      name: name.trim(),
      required_level: requiredLevel,
      created_by: user.id,
      organization_id: tenantId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("DUPLICATE_TEAM_NAME");
    throw new Error(error.message);
  }
  return data;
}

export async function updateManagedTeam(
  id: string,
  name: string,
  requiredLevel: 1 | 2 | 3,
): Promise<ManagedTeam> {
  const supabase = await createClient();
  const tenantId = await requireTenantId();
  const { data, error } = await supabase
    .from("managed_teams")
    .update({ name: name.trim(), required_level: requiredLevel })
    .eq("id", id)
    .eq("organization_id", tenantId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("DUPLICATE_TEAM_NAME");
    throw new Error(error.message);
  }
  return data;
}

export async function deleteManagedTeam(id: string): Promise<void> {
  const supabase = await createClient();
  const tenantId = await requireTenantId();
  const { error } = await supabase
    .from("managed_teams")
    .delete()
    .eq("id", id)
    .eq("organization_id", tenantId);

  if (error) throw new Error(error.message);
}

export async function batchCreateManagedTeams(
  teams: { name: string; requiredLevel: 1 | 2 | 3 }[],
): Promise<ManagedTeam[]> {
  if (teams.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const tenantId = await requireTenantId();

  const rows = teams.map((t) => ({
    name: t.name.trim(),
    required_level: t.requiredLevel,
    created_by: user.id,
    organization_id: tenantId,
  }));

  const { data, error } = await supabase
    .from("managed_teams")
    .insert(rows)
    .select();

  if (error) {
    if (error.code === "23505") throw new Error("DUPLICATE_TEAM_NAME");
    throw new Error(error.message);
  }
  return data ?? [];
}
