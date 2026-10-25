import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchClubDetail,
  fetchTeamPoule,
  fetchTeamPouleFetchedAt,
} from "./discovery";
import { HockeyRateLimitError } from "./client";
import { sweepHomeVenues } from "./venues";
import {
  amsterdamDateOf,
  fixtureToMatchRow,
  isCancelledStatus,
  isSkippedStatus,
  normalizeMatch,
  sameInstant,
} from "./normalize";
import type {
  ApiClubDetail,
  ApiMatchSummary,
  HockeyClient,
  NormalizedFixture,
} from "./types";
import type { MatchReviewReason, TrackedTeam } from "@/lib/types/domain";

export type SyncResult = {
  inserted: number;
  updated: number;
  flagged: number;
  cancelled: number;
  awaitingTime: number;
  errors: string[];
};

export type SyncDeps = {
  /** Service-role client — the engine also runs outside a request context. */
  supabase: SupabaseClient;
  client: HockeyClient;
  now?: Date;
  /** Optional pause between upstream team fetches (jitter for cron runs). */
  pause?: () => Promise<void>;
};

const MAX_TRACKED_TEAMS = 50;

/**
 * How long a sync reuses its venue sweep, and a team's poule when the sweep
 * could not cover the near term. Longer than the 15-minute manual cooldown,
 * so a repeated "sync now" spends the upstream budget (about five requests a
 * minute) on what it has not reached yet instead of refetching what it just
 * did — but well under a day, so the nightly run refreshes everything.
 */
const SYNC_FRESH_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * How long a team's poule is reused once the venue sweep covers the near
 * term (and a club's detail always, for its season rollovers). The poule is then a top-up — fields, home
 * matches away from the club's venues, changes beyond the sweep — so a day
 * is fresh enough. Just under one, so each nightly run still refreshes it.
 */
const SYNC_TOPUP_TTL_MS = 20 * 60 * 60 * 1000;

/** How long a claimed run lease lasts before it self-expires (crash safety). */
const SYNC_LEASE_MS = 10 * 60 * 1000;

function withinCooldown(
  lastSyncedAt: string | null | undefined,
  windowMs: number,
): boolean {
  return (
    !!lastSyncedAt && Date.now() - new Date(lastSyncedAt).getTime() < windowMs
  );
}

/**
 * Claim the right to sync an organization. Two layers:
 *
 * 1. Cooldown: last_synced_at within windowMs → no claim. Only the engine's
 *    final state upsert advances last_synced_at, so a run that throws
 *    mid-way does not count as a completed sync.
 * 2. Lease (atomic): sync_claimed_until is advanced into the future with a
 *    single conditional update — concurrent callers serialize on the row
 *    lock and exactly one wins. A crashed run's lease expires on its own.
 *
 * The cooldown is checked twice: a cheap pre-check, and again after the
 * lease is held. The lease serializes all last_synced_at writers, so the
 * post-claim read cannot be stale — this closes the race where a caller
 * with a stale pre-check claims a lease another run just released.
 *
 * Returns a lease token (the claimed-until timestamp) on success, null when
 * the cooldown is active or another run holds the lease. Callers must
 * releaseSyncSlot() with that token in a finally block — the token fences an
 * over-deadline run from releasing a lease it no longer owns. Fails closed
 * on errors.
 */
export async function claimSyncSlot(
  supabase: SupabaseClient,
  organizationId: string,
  windowMs: number,
): Promise<string | null> {
  const { data: state, error: stateError } = await supabase
    .from("hockey_sync_state")
    .select("last_synced_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (stateError) throw new Error(stateError.message);

  if (!state) {
    // First claim for this org — create the row (a write we skip on the
    // steady-state path).
    const { error: ensureError } = await supabase
      .from("hockey_sync_state")
      .upsert(
        { organization_id: organizationId },
        { onConflict: "organization_id", ignoreDuplicates: true },
      );
    if (ensureError) throw new Error(ensureError.message);
  } else if (withinCooldown(state.last_synced_at, windowMs)) {
    return null;
  }

  // Single conditional update — the column is non-null (epoch default), so
  // no null case exists and no .or() filter is needed (PostgREST rejects
  // logical-operator filters on PATCH).
  const now = Date.now();
  const leaseToken = new Date(now + SYNC_LEASE_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("hockey_sync_state")
    .update({ sync_claimed_until: leaseToken })
    .eq("organization_id", organizationId)
    .lt("sync_claimed_until", new Date(now).toISOString())
    .select("organization_id");
  if (claimError) throw new Error(claimError.message);
  if ((claimed ?? []).length === 0) return null;

  // Re-check under the lease: another run may have completed (advancing
  // last_synced_at) between the pre-check and our claim.
  const { data: recheck, error: recheckError } = await supabase
    .from("hockey_sync_state")
    .select("last_synced_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (recheckError || withinCooldown(recheck?.last_synced_at, windowMs)) {
    await releaseSyncSlot(supabase, organizationId, leaseToken).catch(() => {
      // lease self-expires
    });
    if (recheckError) throw new Error(recheckError.message);
    return null;
  }

  return leaseToken;
}

/**
 * Release a claimed run lease. The token match fences the release: a run
 * that outlived its lease cannot clear a newer claimant's lease.
 */
export async function releaseSyncSlot(
  supabase: SupabaseClient,
  organizationId: string,
  leaseToken: string,
): Promise<void> {
  const { error } = await supabase
    .from("hockey_sync_state")
    .update({ sync_claimed_until: new Date(0).toISOString() })
    .eq("organization_id", organizationId)
    .eq("sync_claimed_until", leaseToken);
  if (error) throw new Error(error.message);
}

/**
 * Claim → sync → release in one place, so the lease invariants (token-fenced
 * release, in a finally, release errors never masking sync errors) live in
 * code instead of at every call site. Returns null when the slot could not
 * be claimed (cooldown active or another run in progress).
 */
export async function syncWithLease(
  deps: SyncDeps,
  organizationId: string,
  windowMs: number,
): Promise<SyncResult | null> {
  const lease = await claimSyncSlot(deps.supabase, organizationId, windowMs);
  if (!lease) return null;
  try {
    return await syncOrganizationMatches(deps, organizationId);
  } finally {
    await releaseSyncSlot(deps.supabase, organizationId, lease).catch(() => {
      // lease self-expires; a failed release must not mask the sync error
    });
  }
}

function mergeReasons(
  existing: unknown,
  added: MatchReviewReason[],
): MatchReviewReason[] {
  const current = Array.isArray(existing)
    ? (existing as MatchReviewReason[])
    : [];
  return Array.from(new Set([...current, ...added]));
}

type ExistingMatchRow = {
  id: string;
  date: string;
  start_time: string | null;
  venue: string | null;
  field: string | null;
  competition: string | null;
  external_id: number | null;
  cancelled_upstream: boolean;
  review_reasons: unknown;
  home_team: string;
  away_team: string;
};

/**
 * A tracked team's home fixture worth syncing, or null: the team's own home
 * match, not played or unusable, and from `today` on — except cancellations,
 * which must still flag an imported row when observed after match day.
 */
export function homeFixtureOf(
  match: ApiMatchSummary,
  team: TrackedTeam,
  today: string,
): NormalizedFixture | null {
  if (match.home?.id !== team.hockey_team_id) return null;
  if (isSkippedStatus(match.status)) return null;
  const fixture = normalizeMatch(match);
  let fixtureDate: string;
  try {
    fixtureDate = amsterdamDateOf(fixture.start);
  } catch {
    return null; // unparseable upstream date
  }
  if (fixtureDate < today && !isCancelledStatus(fixture.status)) {
    return null;
  }
  return fixture;
}

/**
 * Sync one organization's tracked teams against the Match Center: import
 * future home matches with confirmed times, update changed matches in place
 * (flagging them for review), and mark upstream cancellations — never delete.
 */
export async function syncOrganizationMatches(
  deps: SyncDeps,
  organizationId: string,
): Promise<SyncResult> {
  const { supabase, client, now = new Date() } = deps;
  const syncedAt = now.toISOString();
  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    flagged: 0,
    cancelled: 0,
    awaitingTime: 0,
    errors: [],
  };

  // Fetch one extra row so exactly MAX teams is not misreported as truncation.
  const { data: trackedRows, error: trackedError } = await supabase
    .from("tracked_teams")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(MAX_TRACKED_TEAMS + 1);
  if (trackedError) throw new Error(trackedError.message);

  if (!trackedRows || trackedRows.length === 0) {
    return result;
  }
  const trackedTeams = trackedRows.slice(0, MAX_TRACKED_TEAMS);
  if (trackedRows.length > MAX_TRACKED_TEAMS) {
    result.errors.push(
      `Tracked team limit reached: only the first ${MAX_TRACKED_TEAMS} teams are synced`,
    );
  }

  const levelByManagedId = await loadRequiredLevels(supabase, trackedTeams);

  // The pause fires inside the cache layer, only when an upstream fetch
  // actually happens — cache hits don't sleep.
  const discovery = { client, supabase, pause: deps.pause };
  const today = amsterdamDateOf(now.toISOString());
  const teams = trackedTeams as TrackedTeam[];
  const teamById = new Map(teams.map((team) => [team.hockey_team_id, team]));

  // 1. Venue sweep: every match at the club's home venues for four weeks, a
  //    request per venue window however many teams are tracked. When it is
  //    complete, every team's importable near term is covered.
  const sweep = await sweepHomeVenues(discovery, {
    organizationId,
    trackedTeams: teams,
    today,
    ttlMs: SYNC_FRESH_TTL_MS,
  });
  result.errors.push(...sweep.errors);
  const swept = new Map<
    number,
    { fixture: NormalizedFixture; team: TrackedTeam }
  >();
  for (const match of sweep.matches) {
    const team = teamById.get(match.home?.id);
    const fixture = team ? homeFixtureOf(match, team, today) : null;
    if (team && fixture) swept.set(fixture.matchId, { fixture, team });
  }

  /**
   * Whether a top-up failure is only "later": throttling, on a team the
   * sweep already covered. Anything else is reported.
   */
  const deferrable = (error: unknown) =>
    sweep.complete && error instanceof HockeyRateLimitError;
  const pouleTtlMs = sweep.complete ? SYNC_TOPUP_TTL_MS : SYNC_FRESH_TTL_MS;

  // 2. Poule top-up, stalest first: when the upstream throttles part of a
  //    run, the teams it missed are fetched first next time instead of
  //    starving behind the same leaders. Never-fetched teams sort first;
  //    ties keep the tracking order.
  const fetchedAt = await fetchTeamPouleFetchedAt(
    discovery,
    teams
      .filter((team) => team.recent_poule_id != null)
      .map((team) => ({
        pouleId: team.recent_poule_id as number,
        teamId: team.hockey_team_id,
      })),
  );
  const orderedTeams = [...teams].sort((a, b) => {
    const aAt = fetchedAt.get(a.hockey_team_id) ?? -Infinity;
    const bAt = fetchedAt.get(b.hockey_team_id) ?? -Infinity;
    return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
  });

  // One detail per club, loaded on its first team that needs it. A failed
  // club is reported once; its teams fall back to their stored poule.
  const clubDetails = new Map<string, ApiClubDetail | null>();
  const polled = new Map<
    number,
    { fixture: NormalizedFixture; team: TrackedTeam }
  >();
  // Teams that yielded no fixtures from either source — what the run status
  // counts, since one error message can stand for a whole club.
  let failedTeams = 0;
  const lost = () => {
    if (!sweep.complete) failedTeams++;
  };

  for (const team of orderedTeams) {
    let pouleId = team.recent_poule_id;
    const lastFetched = fetchedAt.get(team.hockey_team_id);
    // A fresh cached poule is read as is: the club detail would only be
    // checked for a season rollover, at the cost of a request.
    const pouleFresh =
      pouleId != null &&
      lastFetched !== undefined &&
      now.getTime() - lastFetched < pouleTtlMs;

    if (!pouleFresh) {
      const clubId = team.club_federation_reference_id;
      if (!clubDetails.has(clubId)) {
        try {
          clubDetails.set(
            clubId,
            // Only rollovers are read from it — a day's lag is fine.
            await fetchClubDetail(discovery, clubId, SYNC_TOPUP_TTL_MS),
          );
        } catch (error) {
          if (!deferrable(error)) {
            const message =
              error instanceof Error ? error.message : String(error);
            result.errors.push(`Club ${team.club_name}: ${message}`);
          }
          clubDetails.set(clubId, null);
        }
      }
      const clubDetail = clubDetails.get(clubId);
      if (clubDetail) {
        const apiTeam = clubDetail.teams.find(
          (candidate) => candidate.id === team.hockey_team_id,
        );
        if (!apiTeam) {
          result.errors.push(
            `Team ${team.team_name} not found in club ${team.club_name}`,
          );
          lost();
          continue;
        }
        // Season rollover: follow the upstream recent poule
        if (
          apiTeam.recent_poule_id != null &&
          apiTeam.recent_poule_id !== team.recent_poule_id
        ) {
          pouleId = apiTeam.recent_poule_id;
          const { error } = await supabase
            .from("tracked_teams")
            .update({ recent_poule_id: pouleId })
            .eq("id", team.id);
          if (error) result.errors.push(`${team.team_name}: ${error.message}`);
        }
      }
    }
    if (pouleId == null) {
      result.errors.push(`Team ${team.team_name} has no current poule`);
      lost();
      continue;
    }

    try {
      const response = await fetchTeamPoule(
        discovery,
        pouleId,
        team.hockey_team_id,
        pouleTtlMs,
      );
      for (const match of response.poule?.matches ?? []) {
        const fixture = homeFixtureOf(match, team, today);
        if (fixture) polled.set(fixture.matchId, { fixture, team });
      }
    } catch (error) {
      if (deferrable(error)) continue;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Team ${team.team_name}: ${message}`);
      lost();
    }
  }

  // 3. Merge. The sweep is the fresher source (2h against up to a day) and
  //    wins — but the facility list reports no field, so a poule's field is
  //    kept while both put the match at the same venue.
  const merged = new Map(polled);
  for (const [matchId, entry] of swept) {
    const fromPoule = polled.get(matchId)?.fixture;
    const sameVenue = fromPoule?.venue === entry.fixture.venue;
    merged.set(matchId, {
      team: entry.team,
      fixture:
        fromPoule && sameVenue
          ? {
              ...entry.fixture,
              field: fromPoule.field,
              fieldKnown: fromPoule.fieldKnown,
            }
          : entry.fixture,
    });
  }
  const collected = Array.from(merged.values());

  const reconciled = await reconcileFixtures(
    supabase,
    organizationId,
    collected,
    { today, syncedAt, levelByManagedId },
  );
  const { errors: reconcileErrors, ...counts } = reconciled;
  Object.assign(result, counts);
  result.errors.push(...reconcileErrors);

  const status =
    result.errors.length === 0
      ? "success"
      : failedTeams >= trackedTeams.length
        ? "error"
        : "partial";

  const { error: stateError } = await supabase.from("hockey_sync_state").upsert(
    {
      organization_id: organizationId,
      last_synced_at: syncedAt,
      last_sync_status: status,
      last_sync_error: result.errors[0] ?? null,
      last_inserted: result.inserted,
      last_updated: result.updated,
      last_flagged: result.flagged + result.cancelled,
      awaiting_time_count: result.awaitingTime,
    },
    { onConflict: "organization_id" },
  );
  if (stateError) result.errors.push(stateError.message);

  return result;
}

export type ReconcileResult = Pick<
  SyncResult,
  "inserted" | "updated" | "flagged" | "cancelled" | "awaitingTime" | "errors"
>;

/**
 * Apply Match Center fixtures to an organization's matches: insert newly
 * timed ones, update changed ones in place (flagging them for review),
 * retract a withdrawn time, and mark upstream cancellations — never delete.
 * Shared by the full sync and the club-feed change detector, so both write
 * under the same rules. Callers pass only home fixtures of tracked teams
 * (see homeFixtureOf); `awaitingTime` counts the entries passed, not the
 * club's whole programme.
 */
export async function reconcileFixtures(
  supabase: SupabaseClient,
  organizationId: string,
  entries: Array<{ fixture: NormalizedFixture; team: TrackedTeam }>,
  opts: {
    today: string;
    syncedAt: string;
    levelByManagedId: Map<string, 1 | 2 | 3>;
  },
): Promise<ReconcileResult> {
  const { today, syncedAt, levelByManagedId } = opts;
  const result: ReconcileResult = {
    inserted: 0,
    updated: 0,
    flagged: 0,
    cancelled: 0,
    awaitingTime: 0,
    errors: [],
  };

  const cancelled = entries.filter(({ fixture }) =>
    isCancelledStatus(fixture.status),
  );
  const importable = entries.filter(
    ({ fixture }) =>
      !isCancelledStatus(fixture.status) && fixture.timeConfirmed,
  );
  result.awaitingTime = entries.length - cancelled.length - importable.length;

  // Cancellations may be observed after match day, so the natural-key window
  // must reach back to the earliest entries cancellation — otherwise a
  // past-dated cancellation reissued under a new match id resolves nowhere.
  const naturalFromDate = cancelled.reduce((earliest, { fixture }) => {
    const date = amsterdamDateOf(fixture.start);
    return date < earliest ? date : earliest;
  }, today);

  const { byExternal, byNatural } = await loadExistingMatches(
    supabase,
    organizationId,
    entries.map(({ fixture }) => fixture.matchId),
    entries.map(({ team }) => team),
    naturalFromDate,
  );

  function findExisting(fixture: NormalizedFixture): ExistingMatchRow | null {
    const byId = byExternal.get(fixture.matchId);
    if (byId) return byId;
    const key = `${amsterdamDateOf(fixture.start)}|${fixture.homeTeamName}|${fixture.awayTeamName}`;
    return byNatural.get(key) ?? null;
  }

  const unchangedIds: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];

  for (const { fixture, team } of importable) {
    const requiredLevel = team.managed_team_id
      ? (levelByManagedId.get(team.managed_team_id) ?? 1)
      : 1;
    const row = fixtureToMatchRow(fixture, requiredLevel);
    const existing = findExisting(fixture);

    if (!existing) {
      toInsert.push({
        ...row,
        source: "hockey_sync",
        created_by: team.created_by,
        organization_id: organizationId,
        last_synced_at: syncedAt,
      });
      continue;
    }

    const reasons: MatchReviewReason[] = [];
    if (existing.date !== row.date) reasons.push("date_changed");
    if (!sameInstant(existing.start_time, row.start_time)) {
      reasons.push("time_changed");
    }
    // An unknown field (facility lists omit it) is never compared: it
    // would flag every match the planner already has a field for. A pitch
    // assigned where none was stored — typically a match first imported from
    // the sweep — is filled in silently: nothing moved. A changed or
    // withdrawn pitch is flagged.
    const fieldChanged =
      fixture.fieldKnown && (existing.field ?? null) !== row.field;
    const fieldAssigned = fieldChanged && (existing.field ?? null) === null;
    if (
      (existing.venue ?? null) !== row.venue ||
      (fieldChanged && !fieldAssigned)
    ) {
      reasons.push("venue_changed");
    }
    // Competition renames (season phase changes) update silently — cosmetic,
    // no review needed.
    const competitionChanged =
      (existing.competition ?? null) !== row.competition;
    const silentChange = competitionChanged || fieldAssigned;

    // Also adopts rows whose external id changed (upstream reissued the
    // fixture under a new match id with the same natural key).
    const adopting = existing.external_id !== fixture.matchId;
    if (reasons.length === 0 && !adopting && !silentChange) {
      unchangedIds.push(existing.id);
      continue;
    }

    // required_level is intentionally not written — the planner may have
    // overridden it after import.
    const payload: Record<string, unknown> = {
      date: row.date,
      start_time: row.start_time,
      venue: row.venue,
      competition: row.competition,
      external_id: fixture.matchId,
      source: "hockey_sync",
      last_synced_at: syncedAt,
    };
    // An unknown field keeps the stored one — unless the venue moved, which
    // leaves the stored field pointing at the old park.
    if (fixture.fieldKnown || (existing.venue ?? null) !== row.venue) {
      payload.field = row.field;
    }
    if (reasons.length > 0) {
      payload.needs_review = true;
      payload.review_reasons = mergeReasons(existing.review_reasons, reasons);
    }

    const { error } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      result.errors.push(`Match ${fixture.matchId}: ${error.message}`);
    } else if (reasons.length > 0) {
      result.updated++;
      result.flagged++;
    } else if (silentChange) {
      result.updated++;
    }
  }

  if (toInsert.length > 0) {
    // One bulk insert; per-row fallback only on failure so individual
    // errors stay attributable.
    const { error } = await supabase.from("matches").insert(toInsert);
    if (!error) {
      result.inserted += toInsert.length;
    } else {
      for (const insertRow of toInsert) {
        const { error: rowError } = await supabase
          .from("matches")
          .insert(insertRow);
        if (rowError) {
          result.errors.push(
            `Match ${insertRow.external_id}: ${rowError.message}`,
          );
        } else {
          result.inserted++;
        }
      }
    }
  }

  // A previously confirmed time can be retracted upstream (back to
  // "announced" at midnight). The stale time must not stand unflagged —
  // planners would staff a match on a withdrawn time. Clear it and flag;
  // an already-null start_time keeps subsequent syncs idempotent.
  const awaiting = entries.filter(
    ({ fixture }) =>
      !isCancelledStatus(fixture.status) && !fixture.timeConfirmed,
  );
  for (const { fixture } of awaiting) {
    const existing = byExternal.get(fixture.matchId);
    if (!existing || existing.start_time === null) continue;

    const { error } = await supabase
      .from("matches")
      .update({
        start_time: null,
        needs_review: true,
        review_reasons: mergeReasons(existing.review_reasons, ["time_changed"]),
        last_synced_at: syncedAt,
      })
      .eq("id", existing.id);
    if (error) {
      result.errors.push(`Match ${fixture.matchId}: ${error.message}`);
    } else {
      result.updated++;
      result.flagged++;
    }
  }

  for (const { fixture } of cancelled) {
    const existing = findExisting(fixture);
    // Cancelled matches we never imported are simply skipped.
    if (!existing || existing.cancelled_upstream) continue;

    const { error } = await supabase
      .from("matches")
      .update({
        cancelled_upstream: true,
        needs_review: true,
        review_reasons: mergeReasons(existing.review_reasons, ["cancelled"]),
        external_id: fixture.matchId,
        last_synced_at: syncedAt,
      })
      .eq("id", existing.id);
    if (error) {
      result.errors.push(`Match ${fixture.matchId}: ${error.message}`);
    } else {
      result.cancelled++;
    }
  }

  if (unchangedIds.length > 0) {
    await supabase
      .from("matches")
      .update({ last_synced_at: syncedAt })
      .in("id", unchangedIds);
  }

  return result;
}

export async function loadRequiredLevels(
  supabase: SupabaseClient,
  trackedTeams: Array<{ managed_team_id: string | null }>,
): Promise<Map<string, 1 | 2 | 3>> {
  const managedIds = trackedTeams
    .map((team) => team.managed_team_id)
    .filter((id): id is string => id !== null);
  const levels = new Map<string, 1 | 2 | 3>();
  if (managedIds.length === 0) return levels;

  const { data, error } = await supabase
    .from("managed_teams")
    .select("id, required_level")
    .in("id", managedIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    levels.set(row.id, row.required_level);
  }
  return levels;
}

const EXISTING_MATCH_COLUMNS =
  "id, date, start_time, venue, field, competition, external_id, cancelled_upstream, review_reasons, home_team, away_team";

async function loadExistingMatches(
  supabase: SupabaseClient,
  organizationId: string,
  externalIds: number[],
  trackedTeams: TrackedTeam[],
  fromDate: string,
): Promise<{
  byExternal: Map<number, ExistingMatchRow>;
  byNatural: Map<string, ExistingMatchRow>;
}> {
  const byExternal = new Map<number, ExistingMatchRow>();
  const byNatural = new Map<string, ExistingMatchRow>();
  if (externalIds.length === 0) return { byExternal, byNatural };

  const { data: externalRows, error: externalError } = await supabase
    .from("matches")
    .select(EXISTING_MATCH_COLUMNS)
    .eq("organization_id", organizationId)
    .in("external_id", externalIds);
  if (externalError) throw new Error(externalError.message);
  for (const row of (externalRows ?? []) as ExistingMatchRow[]) {
    if (row.external_id != null) byExternal.set(row.external_id, row);
  }

  // Natural-key adoption only targets future fixtures — bound the query.
  // Rows with a (stale) external_id are included so a fixture reissued
  // upstream under a new match id re-adopts the existing row instead of
  // colliding with the natural-key unique constraint.
  const teamNames = Array.from(
    new Set(trackedTeams.map((team) => team.team_name)),
  );
  const { data: naturalRows, error: naturalError } = await supabase
    .from("matches")
    .select(EXISTING_MATCH_COLUMNS)
    .eq("organization_id", organizationId)
    .gte("date", fromDate)
    .in("home_team", teamNames);
  if (naturalError) throw new Error(naturalError.message);
  for (const row of (naturalRows ?? []) as ExistingMatchRow[]) {
    byNatural.set(`${row.date}|${row.home_team}|${row.away_team}`, row);
  }

  return { byExternal, byNatural };
}
