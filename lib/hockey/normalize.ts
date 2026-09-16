import type { ApiMatchSummary, NormalizedFixture } from "./types";
import type { ParsedMatch } from "@/lib/parsers/types";

/** Matches already played or in an unusable state — never imported. */
const SKIPPED_STATUSES = new Set([
  "final",
  "result",
  "live",
  "expired",
  "unknown",
]);

const CANCELLED_STATUSES = new Set(["cancelled", "discontinued"]);

export function isSkippedStatus(status: string): boolean {
  return SKIPPED_STATUSES.has(status);
}

export function isCancelledStatus(status: string): boolean {
  return CANCELLED_STATUSES.has(status);
}

/**
 * An `announced` match with a local-midnight timestamp means "date announced,
 * time TBD" (docs/hockey-match-center-api.md §12). Check the literal time in
 * the RFC 3339 string — the payload carries the intended local offset.
 */
export function isTimeConfirmed(m: ApiMatchSummary): boolean {
  if (m.status !== "announced") return true;
  const time = m.date.match(/T(\d{2}:\d{2})/);
  if (!time) return false;
  return time[1] !== "00:00";
}

/** Two timestamps pointing at the same instant (or both absent). */
export function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

export function normalizeMatch(m: ApiMatchSummary): NormalizedFixture {
  return {
    matchId: m.id,
    start: m.date,
    timeConfirmed: isTimeConfirmed(m),
    status: m.status,
    homeTeamName: m.home.name,
    awayTeamName: m.away.name,
    competition: m.competition_name ?? null,
    venue: m.location?.facility?.name ?? null,
    field: m.location?.field?.name ?? null,
  };
}

/** Calendar date of an instant in Europe/Amsterdam, as YYYY-MM-DD. */
export function amsterdamDateOf(iso: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function fixtureToMatchRow(
  fixture: NormalizedFixture,
  requiredLevel: 1 | 2 | 3,
): ParsedMatch & { external_id: number } {
  return {
    date: amsterdamDateOf(fixture.start),
    start_time: fixture.start,
    home_team: fixture.homeTeamName,
    away_team: fixture.awayTeamName,
    venue: fixture.venue,
    field: fixture.field,
    competition: fixture.competition,
    required_level: requiredLevel,
    external_id: fixture.matchId,
  };
}
