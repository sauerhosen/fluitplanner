"use server";

import { createClient } from "@/lib/supabase/server";
import type { Umpire } from "@/lib/types/domain";

export type UmpireFilters = {
  search?: string;
  level?: 1 | 2 | 3;
};

export async function getUmpires(filters?: UmpireFilters): Promise<Umpire[]> {
  const supabase = await createClient();
  let query = supabase.from("umpires").select("*").order("name");

  if (filters?.level) {
    query = query.eq("level", filters.level);
  }
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createUmpire(umpire: {
  name: string;
  email: string;
  level?: 1 | 2 | 3;
}): Promise<Umpire> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("umpires")
    .insert({
      name: umpire.name.trim(),
      email: umpire.email.trim().toLowerCase(),
      level: umpire.level ?? 1,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateUmpire(
  id: string,
  updates: Partial<{ name: string; email: string; level: 1 | 2 | 3 }>,
): Promise<Umpire> {
  const supabase = await createClient();

  const cleanUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.email !== undefined)
    cleanUpdates.email = updates.email.trim().toLowerCase();
  if (updates.level !== undefined) cleanUpdates.level = updates.level;

  const { data, error } = await supabase
    .from("umpires")
    .update(cleanUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteUmpire(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("umpires").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
