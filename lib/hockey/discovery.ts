import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedJson } from "./cache";
import type {
  ApiClubDetail,
  ApiClubSummary,
  ApiTeamPouleResponse,
  HockeyClient,
} from "./types";

export type DiscoveryDeps = {
  client: HockeyClient;
  supabase: SupabaseClient;
};

const HOUR_MS = 60 * 60 * 1000;

const CLUBS_TTL_MS = 24 * HOUR_MS;
const CLUB_DETAIL_TTL_MS = 6 * HOUR_MS;
const POULE_TEAM_TTL_MS = 15 * 60 * 1000;

/** All regular clubs (business clubs excluded), cached 24h. */
export async function fetchAllClubs(
  deps: DiscoveryDeps,
): Promise<ApiClubSummary[]> {
  const clubs = await getCachedJson<ApiClubSummary[]>(
    deps.supabase,
    "clubs",
    CLUBS_TTL_MS,
    () => deps.client.get<ApiClubSummary[]>("/clubs"),
  );
  return clubs.filter((club) => club.type !== "business");
}

/** Club details including its teams, cached 6h. */
export async function fetchClubDetail(
  deps: DiscoveryDeps,
  clubId: string,
): Promise<ApiClubDetail> {
  return getCachedJson<ApiClubDetail>(
    deps.supabase,
    `club:${clubId}`,
    CLUB_DETAIL_TTL_MS,
    () =>
      deps.client.get<ApiClubDetail>(`/clubs/${encodeURIComponent(clubId)}`),
  );
}

/**
 * Team + selected poule (standings and matches), cached 15 min.
 * The cache also dedupes upstream calls across orgs tracking the same team.
 */
export async function fetchTeamPoule(
  deps: DiscoveryDeps,
  pouleId: number,
  teamId: number,
): Promise<ApiTeamPouleResponse> {
  return getCachedJson<ApiTeamPouleResponse>(
    deps.supabase,
    `poule-team:${pouleId}:${teamId}`,
    POULE_TEAM_TTL_MS,
    () =>
      deps.client.get<ApiTeamPouleResponse>(
        `/poules/${pouleId}/teams/${teamId}`,
      ),
  );
}
