"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireTenantId } from "@/lib/tenant";
import { isPlannerRole } from "@/lib/actions/organization-settings";
import { createHockeyClient } from "@/lib/hockey/client";
import { createDbCredentialStore } from "@/lib/hockey/credential-store";
import { fetchAllClubs, fetchClubDetail } from "@/lib/hockey/discovery";
import type { DiscoveryDeps } from "@/lib/hockey/discovery";
import type { TrackedTeam } from "@/lib/types/domain";

export type ClubSearchResult = {
  id: string;
  name: string;
  city: string;
};

export type ClubTeamOption = {
  teamId: number;
  name: string;
  hockeyType: string | null;
  recentPouleId: number | null;
  tracked: boolean;
};

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/**
 * All hockey-team actions are planner-gated — including read-only search —
 * so the app cannot be used as an open proxy to the upstream API.
 */
async function requirePlanner() {
  const auth = await requireAuth();
  const tenantId = await requireTenantId();
  if (!(await isPlannerRole())) throw new Error("NOT_PLANNER");
  return { ...auth, tenantId };
}

function discoveryDeps(): DiscoveryDeps {
  const service = createServiceClient();
  return {
    supabase: service,
    client: createHockeyClient({ store: createDbCredentialStore(service) }),
  };
}

export async function searchClubs(query: string): Promise<ClubSearchResult[]> {
  await requirePlanner();

  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  const clubs = await fetchAllClubs(discoveryDeps());
  return clubs
    .filter(
      (club) =>
        club.friendly_name.toLowerCase().includes(trimmed) ||
        club.name.toLowerCase().includes(trimmed) ||
        club.city.toLowerCase().includes(trimmed),
    )
    .slice(0, 20)
    .map((club) => ({
      id: club.federation_reference_id,
      name: club.friendly_name,
      city: club.city,
    }));
}

export async function getClubTeams(clubId: string): Promise<ClubTeamOption[]> {
  const { supabase, tenantId } = await requirePlanner();

  const detail = await fetchClubDetail(discoveryDeps(), clubId);

  const { data: tracked, error } = await supabase
    .from("tracked_teams")
    .select("hockey_team_id")
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
  const trackedIds = new Set(
    (tracked ?? []).map((row) => row.hockey_team_id as number),
  );

  // v1 imports field hockey ("VE") teams only
  return detail.teams
    .filter((team) => team.hockey_type === "VE")
    .map((team) => ({
      teamId: team.id,
      name: team.name,
      hockeyType: team.hockey_type ?? null,
      recentPouleId: team.recent_poule_id ?? null,
      tracked: trackedIds.has(team.id),
    }));
}

export async function getTrackedTeams(): Promise<TrackedTeam[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("tracked_teams")
    .select("*")
    .eq("organization_id", tenantId)
    .order("club_name")
    .order("team_name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function trackTeam(input: {
  clubId: string;
  clubName: string;
  teamId: number;
  teamName: string;
  hockeyType: string | null;
  recentPouleId: number | null;
}): Promise<TrackedTeam> {
  const { supabase, user, tenantId } = await requirePlanner();

  // Reuse an existing managed team with the same name, or create one so the
  // existing name-based import/required-level logic applies to synced matches.
  const { data: existing, error: findError } = await supabase
    .from("managed_teams")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("name", input.teamName)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  let managedTeamId = existing?.id ?? null;
  if (!managedTeamId) {
    const { data: created, error: createError } = await supabase
      .from("managed_teams")
      .insert({
        name: input.teamName,
        required_level: 1,
        created_by: user.id,
        organization_id: tenantId,
      })
      .select()
      .single();
    if (createError) {
      if (createError.code !== "23505") throw new Error(createError.message);
      // Lost a create race — reuse the row the concurrent request made.
      const { data: raced, error: racedError } = await supabase
        .from("managed_teams")
        .select("id")
        .eq("organization_id", tenantId)
        .eq("name", input.teamName)
        .single();
      if (racedError) throw new Error(racedError.message);
      managedTeamId = raced.id;
    } else {
      managedTeamId = created.id;
    }
  }

  const { data, error } = await supabase
    .from("tracked_teams")
    .insert({
      organization_id: tenantId,
      club_federation_reference_id: input.clubId,
      club_name: input.clubName,
      hockey_team_id: input.teamId,
      team_name: input.teamName,
      hockey_type: input.hockeyType,
      recent_poule_id: input.recentPouleId,
      managed_team_id: managedTeamId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("ALREADY_TRACKED");
    throw new Error(error.message);
  }
  return data;
}

export async function untrackTeam(id: string): Promise<void> {
  const { supabase, tenantId } = await requirePlanner();

  // Deletes only the tracking config — matches and the managed team stay.
  const { error } = await supabase
    .from("tracked_teams")
    .delete()
    .eq("id", id)
    .eq("organization_id", tenantId);

  if (error) throw new Error(error.message);
}
