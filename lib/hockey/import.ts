import {
  amsterdamDateOf,
  isCancelledStatus,
  isSkippedStatus,
  normalizeMatch,
} from "./normalize";
import type { ApiMatchSummary } from "./types";

/**
 * One upstream fixture a planner may import by hand, from a team the club
 * does not track. Unlike the nightly sync this is a deliberate one-off, so a
 * fixture whose kick-off time is still TBD is offered too — with a null
 * `start`, the same shape a hand-added match without a time has.
 */
export type ImportableFixture = {
  matchId: number;
  /** Calendar date in Europe/Amsterdam (YYYY-MM-DD). */
  date: string;
  start: string | null;
  timeConfirmed: boolean;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  venue: string | null;
  field: string | null;
};

/**
 * The fixtures of one poule that a planner could import for `teamId`:
 * its own future home matches, still to be played. Away matches are left
 * out — the home club staffs the umpires — and so are cancellations, which
 * have nothing to staff. Sorted by kick-off, soonest first.
 */
export function collectImportableFixtures(
  matches: ApiMatchSummary[],
  teamId: number,
  today: string,
): ImportableFixture[] {
  const fixtures: ImportableFixture[] = [];

  for (const match of matches) {
    if (match.home?.id !== teamId) continue;
    if (isSkippedStatus(match.status) || isCancelledStatus(match.status)) {
      continue;
    }

    const normalized = normalizeMatch(match);
    let date: string;
    try {
      date = amsterdamDateOf(normalized.start);
    } catch {
      continue; // unparseable upstream date
    }
    if (date < today) continue;

    fixtures.push({
      matchId: normalized.matchId,
      date,
      start: normalized.timeConfirmed ? normalized.start : null,
      timeConfirmed: normalized.timeConfirmed,
      homeTeam: normalized.homeTeamName,
      awayTeam: normalized.awayTeamName,
      competition: normalized.competition,
      venue: normalized.venue,
      field: normalized.field,
    });
  }

  return fixtures.sort((a, b) =>
    `${a.date}${a.start ?? ""}`.localeCompare(`${b.date}${b.start ?? ""}`),
  );
}
