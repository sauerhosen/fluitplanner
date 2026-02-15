"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type { Umpire } from "@/lib/types/domain";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export type UmpireFilters = {
  search?: string;
  level?: 1 | 2 | 3;
};

export async function getUmpires(filters?: UmpireFilters): Promise<Umpire[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data: roster, error: rosterError } = await supabase
    .from("organization_umpires")
    .select("umpire_id")
    .eq("organization_id", tenantId);

  if (rosterError) throw new Error(rosterError.message);
  if (!roster || roster.length === 0) return [];

  const umpireIds = roster.map((r) => r.umpire_id);

  let query = supabase
    .from("umpires")
    .select("*")
    .in("id", umpireIds)
    .order("name");

  if (filters?.level) {
    query = query.eq("level", filters.level);
  }
  if (filters?.search) {
    const sanitized = filters.search.replace(/[%_,().]/g, "");
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
    }
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
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();
  const normalizedEmail = umpire.email.trim().toLowerCase();

  // Check if umpire already exists by email
  const { data: existing } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  let umpireRecord: Umpire;

  if (existing) {
    umpireRecord = existing;
  } else {
    const { data, error } = await supabase
      .from("umpires")
      .insert({
        name: umpire.name.trim(),
        email: normalizedEmail,
        level: umpire.level ?? 1,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    umpireRecord = data;
  }

  // Link umpire to current organization
  const { error: linkError } = await supabase
    .from("organization_umpires")
    .upsert(
      { organization_id: tenantId, umpire_id: umpireRecord.id },
      { onConflict: "organization_id,umpire_id" },
    );

  if (linkError) throw new Error(linkError.message);

  return umpireRecord;
}

export async function updateUmpire(
  id: string,
  updates: Partial<{ name: string; email: string; level: 1 | 2 | 3 }>,
): Promise<Umpire> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Verify the umpire belongs to the current org's roster
  const { data: rosterEntry } = await supabase
    .from("organization_umpires")
    .select("umpire_id")
    .eq("organization_id", tenantId)
    .eq("umpire_id", id)
    .single();

  if (!rosterEntry) throw new Error("Umpire not in this organization");

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
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Remove umpire from this organization's roster (not from the umpires table)
  const { error } = await supabase
    .from("organization_umpires")
    .delete()
    .eq("organization_id", tenantId)
    .eq("umpire_id", id);

  if (error) throw new Error(error.message);
}
