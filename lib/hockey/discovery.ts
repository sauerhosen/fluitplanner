import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedAt, getCachedJson } from "./cache";
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

/** The widest window the facility match list accepts ("14 days or less"). */
export const MAX_FACILITY_WINDOW_DAYS = 14;

/** A YYYY-MM-DD calendar date shifted by whole days. */
export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

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

/** Club details including its teams, cached 6h unless the caller asks otherwise. */
export async function fetchClubDetail(
  deps: DiscoveryDeps,
  clubId: string,
  ttlMs: number = CLUB_DETAIL_TTL_MS,
): Promise<ApiClubDetail> {
  return getCachedJson<ApiClubDetail>(
    deps.supabase,
    `club:${clubId}`,
    ttlMs,
    () =>
      deps.client.get<ApiClubDetail>(`/clubs/${encodeURIComponent(clubId)}`),
    deps.pause,
  );
}

function pouleTeamKey(pouleId: number, teamId: number): string {
  return `poule-team:${pouleId}:${teamId}`;
}

/**
 * Team + selected poule (standings and matches), cached 15 min unless the
 * caller asks for another TTL. The cache also dedupes upstream calls across
 * orgs tracking the same team.
 */
export async function fetchTeamPoule(
  deps: DiscoveryDeps,
  pouleId: number,
  teamId: number,
  ttlMs: number = POULE_TEAM_TTL_MS,
): Promise<ApiTeamPouleResponse> {
  return getCachedJson<ApiTeamPouleResponse>(
    deps.supabase,
    pouleTeamKey(pouleId, teamId),
    ttlMs,
    () =>
      deps.client.get<ApiTeamPouleResponse>(
        `/poules/${pouleId}/teams/${teamId}`,
      ),
    deps.pause,
  );
}

/**
 * When each team's poule was last fetched upstream, keyed by team id; teams
 * never fetched are absent. Lets the sync spend a throttled request budget on
 * the stalest teams first.
 */
export async function fetchTeamPouleFetchedAt(
  deps: DiscoveryDeps,
  teams: Array<{ pouleId: number; teamId: number }>,
): Promise<Map<number, number>> {
  const cachedAt = await getCachedAt(
    deps.supabase,
    teams.map(({ pouleId, teamId }) => pouleTeamKey(pouleId, teamId)),
  );
  const byTeam = new Map<number, number>();
  for (const { pouleId, teamId } of teams) {
    const fetchedAt = cachedAt.get(pouleTeamKey(pouleId, teamId));
    if (fetchedAt !== undefined) byTeam.set(teamId, fetchedAt);
  }
  return byTeam;
}

/**
 * One match's detail. A superset of the list shape — including `location`
 * with the field, which facility lists omit — so normalizeMatch() takes it as
 * is. The cache shares an answer across orgs watching the same match.
 */
export async function fetchMatch(
  deps: DiscoveryDeps,
  matchId: number,
  ttlMs: number,
): Promise<ApiMatchSummary> {
  return getCachedJson<ApiMatchSummary>(
    deps.supabase,
    `match:${matchId}`,
    ttlMs,
    () => deps.client.get<ApiMatchSummary>(`/matches/${matchId}`),
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
 * Every match played at one facility from `date` on, for `days` calendar days
 * (default 1, at most 14 — the upstream rejects wider windows), cached 15 min
 * unless the caller asks otherwise. One request covers all of a venue's
 * teams, which is what keeps a club-wide lookup far below the upstream rate
 * limit (one poule per team is not — a big club has ~80 field teams). The
 * upstream window's end is exclusive, so a single day asks for
 * `[date, date + 1)`.
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
  opts: { days?: number; ttlMs?: number } = {},
): Promise<ApiMatchSummary[]> {
  const days = opts.days ?? 1;
  if (!Number.isInteger(days) || days < 1 || days > MAX_FACILITY_WINDOW_DAYS) {
    throw new Error(`Facility window must be 1–14 days, got ${days}`);
  }
  const end = addDays(date, days);

  const response = await getCachedJson<ApiFacilityMatchesResponse>(
    deps.supabase,
    // The one-day key predates windows; keep it so the day import's cache
    // survives.
    days === 1
      ? `facility-matches:${facilityId}:${date}`
      : `facility-matches:${facilityId}:${date}:${days}d`,
    opts.ttlMs ?? FACILITY_MATCHES_TTL_MS,
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
