import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchClubDetail, fetchTeamPoule } from "./discovery";
import {
  amsterdamDateOf,
  fixtureToMatchRow,
  normalizeMatch,
} from "./normalize";
import type { HockeyClient, NormalizedFixture } from "./types";
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

/** Matches already played or in an unusable state — never imported. */
const SKIPPED_STATUSES = new Set([
  "final",
  "result",
  "live",
  "expired",
  "unknown",
]);

const CANCELLED_STATUSES = new Set(["cancelled", "discontinued"]);

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
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

  const { data: trackedTeams, error: trackedError } = await supabase
    .from("tracked_teams")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(MAX_TRACKED_TEAMS);
  if (trackedError) throw new Error(trackedError.message);

  if (!trackedTeams || trackedTeams.length === 0) {
    return result;
  }
  if (trackedTeams.length === MAX_TRACKED_TEAMS) {
    result.errors.push(
      `Tracked team limit reached: only the first ${MAX_TRACKED_TEAMS} teams are synced`,
    );
  }

  const levelByManagedId = await loadRequiredLevels(supabase, trackedTeams);

  // The pause fires inside the cache layer, only when an upstream fetch
  // actually happens — cache hits don't sleep.
  const discovery = { client, supabase, pause: deps.pause };
  const today = amsterdamDateOf(now.toISOString());
  const collected: Array<{ fixture: NormalizedFixture; team: TrackedTeam }> =
    [];

  const teamsByClub = new Map<string, TrackedTeam[]>();
  for (const team of trackedTeams as TrackedTeam[]) {
    const list = teamsByClub.get(team.club_federation_reference_id) ?? [];
    list.push(team);
    teamsByClub.set(team.club_federation_reference_id, list);
  }

  for (const [clubId, teams] of teamsByClub) {
    let clubDetail;
    try {
      clubDetail = await fetchClubDetail(discovery, clubId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Club ${teams[0].club_name}: ${message}`);
      continue;
    }

    for (const team of teams) {
      const apiTeam = clubDetail.teams.find(
        (candidate) => candidate.id === team.hockey_team_id,
      );
      if (!apiTeam) {
        result.errors.push(
          `Team ${team.team_name} not found in club ${team.club_name}`,
        );
        continue;
      }

      // Season rollover: follow the upstream recent poule
      let pouleId = team.recent_poule_id;
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
      if (pouleId == null) {
        result.errors.push(`Team ${team.team_name} has no current poule`);
        continue;
      }

      try {
        const response = await fetchTeamPoule(
          discovery,
          pouleId,
          team.hockey_team_id,
        );
        for (const match of response.poule?.matches ?? []) {
          if (match.home?.id !== team.hockey_team_id) continue;
          if (SKIPPED_STATUSES.has(match.status)) continue;
          const fixture = normalizeMatch(match);
          let fixtureDate: string;
          try {
            fixtureDate = amsterdamDateOf(fixture.start);
          } catch {
            continue; // unparseable upstream date
          }
          // Past matches are skipped — except cancellations, which must
          // still flag an imported row even when observed after match day.
          if (fixtureDate < today && !CANCELLED_STATUSES.has(fixture.status)) {
            continue;
          }
          collected.push({ fixture, team });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Team ${team.team_name}: ${message}`);
      }
    }
  }

  const cancelled = collected.filter(({ fixture }) =>
    CANCELLED_STATUSES.has(fixture.status),
  );
  const importable = collected.filter(
    ({ fixture }) =>
      !CANCELLED_STATUSES.has(fixture.status) && fixture.timeConfirmed,
  );
  result.awaitingTime = collected.length - cancelled.length - importable.length;

  const { byExternal, byNatural } = await loadExistingMatches(
    supabase,
    organizationId,
    collected.map(({ fixture }) => fixture.matchId),
    trackedTeams as TrackedTeam[],
    today,
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
    if (
      (existing.venue ?? null) !== row.venue ||
      (existing.field ?? null) !== row.field
    ) {
      reasons.push("venue_changed");
    }
    // Competition renames (season phase changes) update silently — cosmetic,
    // no review needed.
    const competitionChanged =
      (existing.competition ?? null) !== row.competition;

    // Also adopts rows whose external id changed (upstream reissued the
    // fixture under a new match id with the same natural key).
    const adopting = existing.external_id !== fixture.matchId;
    if (reasons.length === 0 && !adopting && !competitionChanged) {
      unchangedIds.push(existing.id);
      continue;
    }

    // required_level is intentionally not written — the planner may have
    // overridden it after import.
    const payload: Record<string, unknown> = {
      date: row.date,
      start_time: row.start_time,
      venue: row.venue,
      field: row.field,
      competition: row.competition,
      external_id: fixture.matchId,
      source: "hockey_sync",
      last_synced_at: syncedAt,
    };
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
    } else if (competitionChanged) {
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

  const status =
    result.errors.length === 0
      ? "success"
      : result.errors.length >= trackedTeams.length
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

async function loadRequiredLevels(
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
