import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedJson } from "./cache";
import type {
  ApiClubDetail,
  ApiClubSummary,
  ApiFacility,
  ApiFacilityMatchesResponse,
  ApiMatchSummary,
  ApiTeamPouleResponse,
  HockeyClient,
} from "./types";

export type DiscoveryDeps = {
  client: HockeyClient;
  supabase: SupabaseClient;
  /** Optional jitter between real upstream fetches (cache hits skip it). */
  pause?: () => Promise<void>;
};

const HOUR_MS = 60 * 60 * 1000;

const CLUBS_TTL_MS = 24 * HOUR_MS;
const CLUB_DETAIL_TTL_MS = 6 * HOUR_MS;
const POULE_TEAM_TTL_MS = 15 * 60 * 1000;
const FACILITIES_TTL_MS = 24 * HOUR_MS;
const FACILITY_MATCHES_TTL_MS = 15 * 60 * 1000;

/** Most venues one club may cost upstream on a single day lookup. */
const MAX_CLUB_FACILITIES = 5;

/** All regular clubs (business clubs excluded), cached 24h. */
export async function fetchAllClubs(
  deps: DiscoveryDeps,
): Promise<ApiClubSummary[]> {
  const clubs = await getCachedJson<ApiClubSummary[]>(
    deps.supabase,
    "clubs",
    CLUBS_TTL_MS,
    () => deps.client.get<ApiClubSummary[]>("/clubs"),
    deps.pause,
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
    deps.pause,
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
    deps.pause,
  );
}

/** All facilities (~850), cached 24h. */
export async function fetchAllFacilities(
  deps: DiscoveryDeps,
): Promise<ApiFacility[]> {
  return getCachedJson<ApiFacility[]>(
    deps.supabase,
    "facilities",
    FACILITIES_TTL_MS,
    () => deps.client.get<ApiFacility[]>("/facilities"),
    deps.pause,
  );
}

/**
 * Every match played at one facility on a calendar day, cached 15 min.
 * One request covers all of a venue's teams, which is what keeps a club-wide
 * day lookup far below the upstream rate limit (one poule per team is not —
 * a big club has ~80 field teams). The upstream window's end is exclusive, so
 * a single day asks for `[date, date + 1)`.
 *
 * Facility-scoped matches can omit `location` — the containing facility is the
 * context — so the facility's own name is filled in as the match's venue.
 * Without it an import would write a null venue, and wipe the venue of a row
 * it adopts.
 */
export async function fetchFacilityMatches(
  deps: DiscoveryDeps,
  facilityId: number,
  date: string,
): Promise<ApiMatchSummary[]> {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10);

  const response = await getCachedJson<ApiFacilityMatchesResponse>(
    deps.supabase,
    `facility-matches:${facilityId}:${date}`,
    FACILITY_MATCHES_TTL_MS,
    () =>
      deps.client.get<ApiFacilityMatchesResponse>(
        `/facilities/${facilityId}/matches?filter[dateStart]=${date}&filter[dateEnd]=${end}`,
      ),
    deps.pause,
  );
  const venue = response?.name ?? null;
  return (response?.matches ?? []).map((match) =>
    match.location?.facility?.name || venue === null
      ? match
      : {
          ...match,
          location: { ...match.location, facility: { name: venue } },
        },
  );
}

/**
 * A club's name without the "HC" family of words, lower-cased: facilities say
 * "(VVV)" where the club is "VVV HC" or "Hockeyclub VVV".
 */
function coreClubName(name: string | null): string {
  return (
    (name ?? "")
      .toLowerCase()
      // "h.c." ends on a non-word character, so it cannot sit inside the
      // trailing `\b` group: "h.c. tilburg" would never lose its prefix.
      .replace(
        /\b(?:m?hc|hockeyclub|hockey club|hockeyvereniging)\b|\bh\.c\./g,
        "",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * The venues a club plays home matches at. The club record carries no venue,
 * so this infers them: facilities whose name mentions the club (Match Center
 * names them like "Sportpark 'Het Loopveld' (AMVJ)"), else the club's own
 * city. A wrong guess only costs a request — callers still filter matches by
 * the home team's club — but a club playing in another city under a name
 * that does not mention it will not be found. When more venues match than the
 * cap allows, those in the club's own city go first, so a name shared with a
 * town ("Rotterdam") does not crowd out the club's own park.
 */
export function pickClubFacilities(
  facilities: ApiFacility[],
  club: ApiClubSummary,
): ApiFacility[] {
  const names = [club.friendly_name, club.name]
    .map(coreClubName)
    .filter((name) => name.length >= 2);
  const city = (club.city ?? "").trim().toLowerCase();

  const byName = facilities.filter((facility) => {
    const facilityName = (facility.name ?? "").toLowerCase();
    return names.some((name) => facilityName.includes(name));
  });
  const inCity = (facility: ApiFacility) =>
    city !== "" && (facility.address?.city ?? "").trim().toLowerCase() === city;

  const picked =
    byName.length > 0
      ? [
          ...byName.filter(inCity),
          ...byName.filter((facility) => !inCity(facility)),
        ]
      : facilities.filter(inCity);
  return picked.slice(0, MAX_CLUB_FACILITIES);
}
