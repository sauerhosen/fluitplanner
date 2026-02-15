"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type { Match } from "@/lib/types/domain";
import type { ParsedMatch } from "@/lib/parsers/types";

export async function upsertMatches(
  matches: ParsedMatch[],
): Promise<{ inserted: number; updated: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let inserted = 0;
  let updated = 0;

  const tenantId = await requireTenantId();

  for (const match of matches) {
    const row = {
      date: match.date,
      start_time: match.start_time,
      home_team: match.home_team,
      away_team: match.away_team,
      venue: match.venue,
      field: match.field,
      competition: match.competition,
      required_level: match.required_level,
      created_by: user.id,
      organization_id: tenantId,
    };

    const { data: existing } = await supabase
      .from("matches")
      .select("id")
      .eq("date", match.date)
      .eq("home_team", match.home_team)
      .eq("away_team", match.away_team)
      .eq("organization_id", tenantId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("matches")
        .update({
          start_time: row.start_time,
          venue: row.venue,
          field: row.field,
          required_level: row.required_level,
          competition: row.competition,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const { error } = await supabase.from("matches").insert(row);
      if (error) throw new Error(error.message);
      inserted++;
    }
  }

  return { inserted, updated };
}

export type MatchFilters = {
  search?: string;
  requiredLevel?: 1 | 2 | 3;
  dateFrom?: string;
  dateTo?: string;
};

export async function getMatches(filters?: MatchFilters): Promise<Match[]> {
  const supabase = await createClient();
  const tenantId = await requireTenantId();
  let query = supabase
    .from("matches")
    .select("*")
    .eq("organization_id", tenantId)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (filters?.dateFrom) {
    query = query.gte("date", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("date", filters.dateTo);
  }
  if (filters?.requiredLevel) {
    query = query.eq("required_level", filters.requiredLevel);
  }
  if (filters?.search) {
    const sanitized = filters.search.replace(/[%_,().]/g, "");
    if (sanitized) {
      query = query.or(
        `home_team.ilike.%${sanitized}%,away_team.ilike.%${sanitized}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMatch(
  match: Omit<Match, "id" | "created_by" | "created_at" | "organization_id">,
): Promise<Match> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("matches")
    .insert({ ...match, created_by: user.id, organization_id: tenantId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateMatch(
  id: string,
  updates: Partial<
    Omit<Match, "id" | "created_by" | "created_at" | "organization_id">
  >,
): Promise<Match> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", tenantId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMatch(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const tenantId = await requireTenantId();

  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("id", id)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
}
