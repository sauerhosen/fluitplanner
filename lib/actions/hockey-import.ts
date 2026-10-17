"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requirePlanner } from "@/lib/auth";
import { createHockeyDeps } from "@/lib/hockey/deps";
import {
  fetchAllClubs,
  fetchAllFacilities,
  fetchClubDetail,
  fetchFacilityMatches,
  fetchTeamPoule,
  pickClubFacilities,
} from "@/lib/hockey/discovery";
import {
  collectClubDayFixtures,
  collectImportableFixtures,
  type ImportableFixture,
} from "@/lib/hockey/import";
import { amsterdamDateOf, sameInstant } from "@/lib/hockey/normalize";

/**
 * One-off Match Center import: a planner picks individual fixtures of a team
 * the club does not track, for the odd match the nightly sync will never see.
 * Nothing is subscribed — the rows land like any other imported match.
 */

export type TeamFixture = ImportableFixture & {
  /** This club already has a match for this upstream fixture. */
  alreadyImported: boolean;
  /** That match's row, so the dialog can take it off again. */
  existingMatchId: string | null;
};

export type ImportFixturesResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type PlannerContext = {
  supabase: SupabaseClient;
  user: { id: string };
  tenantId: string;
};

type ExistingMatchRow = {
  id: string;
  date: string;
  start_time: string | null;
  venue: string | null;
  field: string | null;
  competition: string | null;
  external_id: number | null;
  home_team: string;
  away_team: string;
};

const MATCH_COLUMNS =
  "id, date, start_time, venue, field, competition, external_id, home_team, away_team";

// Club/team discovery is planner-gated throughout (see hockey-teams.ts), so
// the app cannot be used as an open proxy to the upstream API.

/**
 * The team's importable home fixtures, read through its current poule — the
 * same route the sync takes, so a season rollover needs no extra handling.
 */
async function loadFixtures(
  clubId: string,
  teamId: number,
): Promise<ImportableFixture[]> {
  const deps = createHockeyDeps();

  const detail = await fetchClubDetail(deps, clubId);
  const team = (detail.teams ?? []).find(
    (candidate) => candidate.id === teamId,
  );
  if (!team) throw new Error("TEAM_NOT_FOUND");
  if (team.recent_poule_id == null) throw new Error("NO_POULE");

  const response = await fetchTeamPoule(deps, team.recent_poule_id, teamId);
  return collectImportableFixtures(
    response.poule?.matches ?? [],
    teamId,
    amsterdamDateOf(new Date().toISOString()),
  );
}

/**
 * Every importable home fixture a club hosts on `date`. The Match Center has
 * no per-club or per-day listing, and one request per team trips its rate
 * limit ("Too Many Attempts") for a club with dozens of teams — so this asks
 * for the club's venues' match lists for the day instead (1–5 requests) and
 * keeps the club's own home matches. One failing venue fails the whole load:
 * a partial list would read as "that's everything".
 */
async function loadClubDayFixtures(
  clubId: string,
  date: string,
): Promise<ImportableFixture[]> {
  if (!isCalendarDate(date)) throw new Error("INVALID_DATE");
  // Nothing before today is importable (played matches are skipped anyway).
  // Answering without upstream also absorbs the partial years a date input
  // emits while one is typed — 0002, 0020, 0202 — which would otherwise each
  // cost up to five Match Center requests.
  if (date < amsterdamDateOf(new Date().toISOString())) return [];

  const deps = createHockeyDeps();
  const club = (await fetchAllClubs(deps)).find(
    (candidate) => candidate.federation_reference_id === clubId,
  );
  if (!club) throw new Error("CLUB_NOT_FOUND");

  const facilities = pickClubFacilities(await fetchAllFacilities(deps), club);
  const lists = await Promise.all(
    facilities.map((facility) => fetchFacilityMatches(deps, facility.id, date)),
  );

  // A match is listed once per venue it is played at, but dedupe on id in
  // case two inferred venues are the same park under different records.
  // The collected list is already sorted, and a Map keeps insertion order.
  const byId = new Map<number, ImportableFixture>();
  for (const fixture of collectClubDayFixtures(lists.flat(), clubId, date)) {
    if (!byId.has(fixture.matchId)) byId.set(fixture.matchId, fixture);
  }
  return Array.from(byId.values());
}

/** A real `YYYY-MM-DD` day — "2026-13-01" or "2026-02-31" is not one. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Flags the fixtures this club already has — by `external_id`, or by the
 * natural key for a match added by hand — matching exactly the rows an import
 * would update instead of inserting.
 */
async function markAlreadyImported(
  supabase: SupabaseClient,
  tenantId: string,
  fixtures: ImportableFixture[],
): Promise<TeamFixture[]> {
  if (fixtures.length === 0) return [];

  const { byExternal, byNatural } = await loadExistingMatches(
    supabase,
    tenantId,
    fixtures,
  );
  return fixtures.map((fixture) => {
    const existing = findExisting(byExternal, byNatural, fixture);
    return {
      ...fixture,
      alreadyImported: existing !== null,
      existingMatchId: existing?.id ?? null,
    };
  });
}

export async function getTeamFixtures(input: {
  clubId: string;
  teamId: number;
}): Promise<TeamFixture[]> {
  const { supabase, tenantId } = await requirePlanner();
  return markAlreadyImported(
    supabase,
    tenantId,
    await loadFixtures(input.clubId, input.teamId),
  );
}

export async function getClubDayFixtures(input: {
  clubId: string;
  date: string;
}): Promise<TeamFixture[]> {
  const { supabase, tenantId } = await requirePlanner();
  return markAlreadyImported(
    supabase,
    tenantId,
    await loadClubDayFixtures(input.clubId, input.date),
  );
}

export async function importTeamFixtures(input: {
  clubId: string;
  teamId: number;
  matchIds: number[];
}): Promise<ImportFixturesResult> {
  const { supabase, user, tenantId } = await requirePlanner();
  if (input.matchIds.length === 0) return emptyResult();

  return importFixtures(
    { supabase, user, tenantId },
    await loadFixtures(input.clubId, input.teamId),
    input.matchIds,
  );
}

export async function importClubDayFixtures(input: {
  clubId: string;
  date: string;
  matchIds: number[];
}): Promise<ImportFixturesResult> {
  const { supabase, user, tenantId } = await requirePlanner();
  if (input.matchIds.length === 0) return emptyResult();

  return importFixtures(
    { supabase, user, tenantId },
    await loadClubDayFixtures(input.clubId, input.date),
    input.matchIds,
  );
}

function emptyResult(): ImportFixturesResult {
  return { imported: 0, updated: 0, skipped: 0, errors: [] };
}

async function importFixtures(
  { supabase, user, tenantId }: PlannerContext,
  available: ImportableFixture[],
  matchIds: number[],
): Promise<ImportFixturesResult> {
  const result = emptyResult();

  // Only an id selects a match, never client-sent details: the fixtures were
  // just re-read server-side and the picked ids are filtered out of them.
  const wanted = new Set(matchIds);
  const fixtures = available.filter((fixture) => wanted.has(fixture.matchId));
  if (fixtures.length === 0) return result;

  const levels = await loadRequiredLevels(supabase, tenantId, fixtures);
  const { byExternal, byNatural } = await loadExistingMatches(
    supabase,
    tenantId,
    fixtures,
  );
  const syncedAt = new Date().toISOString();

  for (const fixture of fixtures) {
    const existing = findExisting(byExternal, byNatural, fixture);

    const row = {
      date: fixture.date,
      // A fixture still awaiting its kick-off time upstream must not delete a
      // time that is already on the row — typically one the planner typed in
      // by hand on the match this import is adopting. The sync clears a
      // retracted time deliberately, and flags it; a one-off import does not.
      start_time: fixture.start ?? existing?.start_time ?? null,
      venue: fixture.venue,
      field: fixture.field,
      competition: fixture.competition,
    };

    if (!existing) {
      const { error } = await supabase.from("matches").insert({
        ...row,
        home_team: fixture.homeTeam,
        away_team: fixture.awayTeam,
        required_level: levels.get(fixture.homeTeam.trim()) ?? 1,
        external_id: fixture.matchId,
        source: "hockey_sync",
        created_by: user.id,
        organization_id: tenantId,
        last_synced_at: syncedAt,
      });
      if (error) {
        result.errors.push(`${fixture.homeTeam}: ${error.message}`);
      } else {
        result.imported++;
      }
      continue;
    }

    const unchanged =
      existing.date === row.date &&
      sameInstant(existing.start_time, row.start_time) &&
      (existing.venue ?? null) === row.venue &&
      (existing.field ?? null) === row.field &&
      (existing.competition ?? null) === row.competition &&
      existing.external_id === fixture.matchId;
    if (unchanged) {
      result.skipped++;
      continue;
    }

    // The planner asked for this row, so it is not flagged for review, and
    // required_level stays theirs — as it does on a sync update.
    const { error } = await supabase
      .from("matches")
      .update({
        ...row,
        external_id: fixture.matchId,
        source: "hockey_sync",
        last_synced_at: syncedAt,
      })
      .eq("id", existing.id)
      .eq("organization_id", tenantId);
    if (error) {
      result.errors.push(`${fixture.homeTeam}: ${error.message}`);
    } else {
      result.updated++;
    }
  }

  revalidatePath("/protected/matches");
  return result;
}

function naturalKey(fixture: ImportableFixture): string {
  return `${fixture.date}|${fixture.homeTeam}|${fixture.awayTeam}`;
}

/** The row an import of `fixture` would update: by `external_id`, else by natural key. */
function findExisting(
  byExternal: Map<number, ExistingMatchRow>,
  byNatural: Map<string, ExistingMatchRow>,
  fixture: ImportableFixture,
): ExistingMatchRow | null {
  return (
    byExternal.get(fixture.matchId) ??
    byNatural.get(naturalKey(fixture)) ??
    null
  );
}

/** Required level per managed team name, matched exactly as a file import does. */
async function loadRequiredLevels(
  supabase: SupabaseClient,
  organizationId: string,
  fixtures: ImportableFixture[],
): Promise<Map<string, 1 | 2 | 3>> {
  const names = Array.from(
    new Set(fixtures.map((fixture) => fixture.homeTeam.trim())),
  );
  const { data, error } = await supabase
    .from("managed_teams")
    .select("name, required_level")
    .eq("organization_id", organizationId)
    .in("name", names);
  if (error) throw new Error(error.message);

  const levels = new Map<string, 1 | 2 | 3>();
  for (const row of (data ?? []) as Array<{
    name: string;
    required_level: 1 | 2 | 3;
  }>) {
    levels.set(row.name, row.required_level);
  }
  return levels;
}

/**
 * Rows a selected fixture could already correspond to: one this club imported
 * before (`external_id`), or one the planner added by hand on the same date
 * (the natural key) — which the import then adopts instead of duplicating.
 */
async function loadExistingMatches(
  supabase: SupabaseClient,
  organizationId: string,
  fixtures: ImportableFixture[],
): Promise<{
  byExternal: Map<number, ExistingMatchRow>;
  byNatural: Map<string, ExistingMatchRow>;
}> {
  const byExternal = new Map<number, ExistingMatchRow>();
  const byNatural = new Map<string, ExistingMatchRow>();

  // Independent lookups, and both now sit on the list's load path too.
  const [
    { data: externalRows, error: externalError },
    { data: naturalRows, error: naturalError },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("organization_id", organizationId)
      .in(
        "external_id",
        fixtures.map((fixture) => fixture.matchId),
      ),
    supabase
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("organization_id", organizationId)
      .in(
        "date",
        fixtures.map((fixture) => fixture.date),
      )
      .in(
        "home_team",
        fixtures.map((fixture) => fixture.homeTeam),
      ),
  ]);
  if (externalError) throw new Error(externalError.message);
  for (const row of (externalRows ?? []) as ExistingMatchRow[]) {
    if (row.external_id != null) byExternal.set(row.external_id, row);
  }

  if (naturalError) throw new Error(naturalError.message);
  for (const row of (naturalRows ?? []) as ExistingMatchRow[]) {
    byNatural.set(`${row.date}|${row.home_team}|${row.away_team}`, row);
  }

  return { byExternal, byNatural };
}
