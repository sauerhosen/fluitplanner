import {
  fetchAllClubs,
  fetchAllFacilities,
  fetchFacilityMatches,
  MAX_FACILITY_WINDOW_DAYS,
  pickClubFacilities,
  type DiscoveryDeps,
} from "./discovery";
import { HockeyRateLimitError } from "./client";
import type { ApiFacility, ApiMatchSummary } from "./types";
import type { TrackedTeam } from "@/lib/types/domain";

/** How far back synced matches teach the sync where a club plays at home. */
const LEARN_LOOKBACK_DAYS = 180;

/** A venue must host this many synced home matches to be swept — a one-off is the poule top-up's job. */
const MIN_LEARNED_MATCHES = 2;

/** Rows the learned-venue query may read (a big club plays ~100 home matches a fortnight). */
const LEARN_ROW_LIMIT = 5000;

/** Venues one club may be guessed at when nothing is synced yet. */
const MAX_PICKED_PER_CLUB = 2;

/** Venues one sync may sweep: each costs a request per window. */
const MAX_SWEEP_FACILITIES = 4;

/**
 * Windows swept per venue. Two 14-day windows reach four weeks ahead, past
 * the ~3 weeks ahead the federation publishes kick-off times — so the sweep
 * sees every fixture the sync can import.
 */
const SWEEP_WINDOWS = 2;

export type VenueSweep = {
  matches: ApiMatchSummary[];
  /** Every venue window loaded — the near term is covered for every team. */
  complete: boolean;
  /** Failures worth a planner's attention; throttling is not one of them. */
  errors: string[];
};

type SweepInput = {
  organizationId: string;
  trackedTeams: TrackedTeam[];
  /** Europe/Amsterdam calendar date, YYYY-MM-DD. */
  today: string;
};

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The venues a club's tracked teams play their home matches at. Learned from
 * the venues of the club's synced home matches (most-used first), so a club
 * playing at a neighbour's park — AMVJ/VVV teams at both Loopveld parks — is
 * swept where it actually plays. A tracked club with nothing synced yet
 * falls back to guessing from its name and city, as the day import does.
 */
export async function resolveHomeFacilities(
  deps: DiscoveryDeps,
  { organizationId, trackedTeams, today }: SweepInput,
): Promise<ApiFacility[]> {
  const clubByTeamName = new Map(
    trackedTeams.map((team) => [
      team.team_name,
      team.club_federation_reference_id,
    ]),
  );

  const { data, error } = await deps.supabase
    .from("matches")
    .select("home_team, venue")
    .eq("organization_id", organizationId)
    .eq("source", "hockey_sync")
    .in("home_team", Array.from(clubByTeamName.keys()))
    .gte("date", addDays(today, -LEARN_LOOKBACK_DAYS))
    .limit(LEARN_ROW_LIMIT);
  if (error) throw new Error(error.message);

  const countsByClub = new Map<string, Map<string, number>>();
  for (const row of (data ?? []) as Array<{
    home_team: string;
    venue: string | null;
  }>) {
    const clubId = clubByTeamName.get(row.home_team);
    if (!clubId || !row.venue) continue;
    const counts = countsByClub.get(clubId) ?? new Map<string, number>();
    counts.set(row.venue, (counts.get(row.venue) ?? 0) + 1);
    countsByClub.set(clubId, counts);
  }

  const facilities = await fetchAllFacilities(deps);
  const byName = new Map(
    facilities.map((facility) => [facility.name, facility]),
  );

  const picked: ApiFacility[] = [];
  const add = (facility: ApiFacility | undefined) => {
    if (facility && !picked.some((known) => known.id === facility.id)) {
      picked.push(facility);
    }
  };

  const clubIds = Array.from(new Set(clubByTeamName.values()));
  let clubs: Awaited<ReturnType<typeof fetchAllClubs>> | null = null;
  for (const clubId of clubIds) {
    const learned = Array.from(countsByClub.get(clubId) ?? [])
      .filter(([, count]) => count >= MIN_LEARNED_MATCHES)
      .sort(([, a], [, b]) => b - a)
      .map(([venue]) => byName.get(venue))
      .filter((facility): facility is ApiFacility => facility !== undefined);
    if (learned.length > 0) {
      learned.forEach(add);
      continue;
    }
    // Only now: a club with learned venues never costs the club list.
    clubs ??= await fetchAllClubs(deps);
    const club = clubs.find((c) => c.federation_reference_id === clubId);
    if (club) {
      pickClubFacilities(facilities, club)
        .slice(0, MAX_PICKED_PER_CLUB)
        .forEach(add);
    }
  }

  return picked.slice(0, MAX_SWEEP_FACILITIES);
}

/**
 * Every match at the club's home venues for the next four weeks. A facility
 * match list covers all teams playing there, so this costs a request per
 * venue window however many teams are tracked — where reading one poule per
 * team costs one request per team, against an upstream limit of about five
 * requests a minute.
 *
 * Sequential, so the cache layer's pause spaces the upstream calls. A
 * throttled window leaves the sweep incomplete without reporting it: the
 * sync falls back to the poules and decides whether anything was lost.
 */
export async function sweepHomeVenues(
  deps: DiscoveryDeps,
  input: SweepInput & { ttlMs: number },
): Promise<VenueSweep> {
  const sweep: VenueSweep = { matches: [], complete: true, errors: [] };

  let facilities: ApiFacility[];
  try {
    facilities = await resolveHomeFacilities(deps, input);
  } catch (error) {
    if (!(error instanceof HockeyRateLimitError)) {
      sweep.errors.push(`Venues: ${errorMessage(error)}`);
    }
    return { ...sweep, complete: false };
  }
  if (facilities.length === 0) return { ...sweep, complete: false };

  for (const facility of facilities) {
    for (let window = 0; window < SWEEP_WINDOWS; window++) {
      const start = addDays(input.today, window * MAX_FACILITY_WINDOW_DAYS);
      try {
        const matches = await fetchFacilityMatches(deps, facility.id, start, {
          days: MAX_FACILITY_WINDOW_DAYS,
          ttlMs: input.ttlMs,
        });
        sweep.matches.push(...matches);
      } catch (error) {
        sweep.complete = false;
        if (!(error instanceof HockeyRateLimitError)) {
          sweep.errors.push(`Venue ${facility.name}: ${errorMessage(error)}`);
        }
      }
    }
  }
  return sweep;
}
