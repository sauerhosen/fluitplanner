"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type { Match } from "@/lib/types/domain";
import type { ParsedMatch } from "@/lib/parsers/types";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

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
  pollId?: string; // specific poll ID, or "none" for matches not in any poll
};

export type MatchWithPoll = Match & {
  poll: { id: string; title: string | null } | null;
};

export async function getMatches(
  filters?: MatchFilters,
): Promise<MatchWithPoll[]> {
  const supabase = await createClient();
  const tenantId = await requireTenantId();

  // Pre-fetch match IDs for poll filter
  let pollIncludeIds: string[] | undefined;
  let pollExcludeIds: string[] | undefined;

  if (filters?.pollId === "none") {
    const { data: pmRows, error: pmError } = await supabase
      .from("poll_matches")
      .select("match_id, polls!inner(organization_id)")
      .eq("polls.organization_id", tenantId);
    if (pmError) throw new Error(pmError.message);
    pollExcludeIds = (pmRows ?? []).map(
      (r: { match_id: string }) => r.match_id,
    );
  } else if (filters?.pollId) {
    const { data: pmRows, error: pmError } = await supabase
      .from("poll_matches")
      .select("match_id")
      .eq("poll_id", filters.pollId);
    if (pmError) throw new Error(pmError.message);
    pollIncludeIds = (pmRows ?? []).map(
      (r: { match_id: string }) => r.match_id,
    );
    if (pollIncludeIds.length === 0) return [];
  }

  let query = supabase
    .from("matches")
    .select("*")
    .eq("organization_id", tenantId)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (pollIncludeIds) {
    query = query.in("id", pollIncludeIds);
  }
  if (pollExcludeIds && pollExcludeIds.length > 0) {
    query = query.not(
      "id",
      "in",
      `(${pollExcludeIds.map((id) => `"${id}"`).join(",")})`,
    );
  }

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
  const matches: Match[] = data ?? [];

  // Fetch poll info for returned matches
  const matchIds = matches.map((m) => m.id);
  const pollMap = new Map<string, { id: string; title: string | null }>();

  if (matchIds.length > 0) {
    const { data: pmRows, error: pmError } = await supabase
      .from("poll_matches")
      .select("match_id, polls(id, title)")
      .in("match_id", matchIds);
    if (pmError) throw new Error(pmError.message);

    for (const pm of pmRows ?? []) {
      const poll = pm.polls as unknown as {
        id: string;
        title: string | null;
      } | null;
      if (poll && !pollMap.has(pm.match_id)) {
        pollMap.set(pm.match_id, { id: poll.id, title: poll.title });
      }
    }
  }

  return matches.map((m) => ({
    ...m,
    poll: pollMap.get(m.id) ?? null,
  }));
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

export async function deleteMatches(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (ids.length > 500)
    throw new Error("Cannot delete more than 500 items at once");
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { error } = await supabase
    .from("matches")
    .delete()
    .in("id", ids)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/matches");
}
