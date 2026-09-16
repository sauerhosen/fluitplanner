"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requirePlanner } from "@/lib/auth";
import { createHockeyDeps } from "@/lib/hockey/deps";
import { fetchClubDetail, fetchTeamPoule } from "@/lib/hockey/discovery";
import {
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
};

export type ImportFixturesResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
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

export async function getTeamFixtures(input: {
  clubId: string;
  teamId: number;
}): Promise<TeamFixture[]> {
  const { supabase, tenantId } = await requirePlanner();

  const fixtures = await loadFixtures(input.clubId, input.teamId);
  if (fixtures.length === 0) return [];

  const { data, error } = await supabase
    .from("matches")
    .select("external_id")
    .eq("organization_id", tenantId)
    .in(
      "external_id",
      fixtures.map((fixture) => fixture.matchId),
    );
  if (error) throw new Error(error.message);

  const imported = new Set(
    (data ?? []).map((row: { external_id: number | null }) => row.external_id),
  );
  return fixtures.map((fixture) => ({
    ...fixture,
    alreadyImported: imported.has(fixture.matchId),
  }));
}

export async function importTeamFixtures(input: {
  clubId: string;
  teamId: number;
  matchIds: number[];
}): Promise<ImportFixturesResult> {
  const { supabase, user, tenantId } = await requirePlanner();

  const result: ImportFixturesResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const wanted = new Set(input.matchIds);
  if (wanted.size === 0) return result;

  // Re-read the fixtures server-side rather than trusting what the client
  // sends: only an id selects a match, never its details.
  const fixtures = (await loadFixtures(input.clubId, input.teamId)).filter(
    (fixture) => wanted.has(fixture.matchId),
  );
  if (fixtures.length === 0) return result;

  const levels = await loadRequiredLevels(supabase, tenantId, fixtures);
  const { byExternal, byNatural } = await loadExistingMatches(
    supabase,
    tenantId,
    fixtures,
  );
  const syncedAt = new Date().toISOString();

  for (const fixture of fixtures) {
    const existing =
      byExternal.get(fixture.matchId) ??
      byNatural.get(naturalKey(fixture)) ??
      null;

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

  const { data: externalRows, error: externalError } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("organization_id", organizationId)
    .in(
      "external_id",
      fixtures.map((fixture) => fixture.matchId),
    );
  if (externalError) throw new Error(externalError.message);
  for (const row of (externalRows ?? []) as ExistingMatchRow[]) {
    if (row.external_id != null) byExternal.set(row.external_id, row);
  }

  const { data: naturalRows, error: naturalError } = await supabase
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
    );
  if (naturalError) throw new Error(naturalError.message);
  for (const row of (naturalRows ?? []) as ExistingMatchRow[]) {
    byNatural.set(`${row.date}|${row.home_team}|${row.away_team}`, row);
  }

  return { byExternal, byNatural };
}
