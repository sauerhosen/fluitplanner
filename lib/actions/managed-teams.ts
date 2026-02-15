"use server";

import { createClient } from "@/lib/supabase/server";
import type { ManagedTeam } from "@/lib/types/domain";

export async function getManagedTeams(): Promise<ManagedTeam[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("managed_teams")
    .select("*")
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

  const { data, error } = await supabase
    .from("managed_teams")
    .insert({
      name: name.trim(),
      required_level: requiredLevel,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateManagedTeam(
  id: string,
  name: string,
  requiredLevel: 1 | 2 | 3,
): Promise<ManagedTeam> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("managed_teams")
    .update({ name: name.trim(), required_level: requiredLevel })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteManagedTeam(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("managed_teams").delete().eq("id", id);

  if (error) throw new Error(error.message);
}

export async function batchCreateManagedTeams(
  teams: { name: string; requiredLevel: 1 | 2 | 3 }[],
): Promise<ManagedTeam[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = teams.map((t) => ({
    name: t.name.trim(),
    required_level: t.requiredLevel,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("managed_teams")
    .insert(rows)
    .select();

  if (error) throw new Error(error.message);
  return data ?? [];
}
