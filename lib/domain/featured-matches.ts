import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import type { FeaturedMatch, Match, PollSlot } from "@/lib/types/domain";

/**
 * The only columns of `matches` allowed onto the public poll page.
 *
 * `matches` has no anon RLS policy, so the public read goes through the
 * service client and bypasses RLS entirely. That makes this list the sole
 * boundary keeping planner-internal columns — above all `notes`, which holds
 * things like "don't assign Y" — off an unauthenticated page. Never widen it,
 * and never replace the select with "*".
 */
export const FEATURED_MATCH_COLUMNS = [
  "id",
  "start_time",
  "home_team",
  "away_team",
] as const;

export const FEATURED_MATCH_SELECT = FEATURED_MATCH_COLUMNS.join(", ");

export type FeaturedMatchRow = Pick<
  Match,
  "id" | "start_time" | "home_team" | "away_team"
>;

/**
 * Resolves featured match rows to the slots covering their kick-off times.
 *
 * A match with no kick-off time, or one whose kick-off falls outside every
 * slot window, has no slot to appear in and is dropped.
 */
export function resolveFeaturedMatches(
  rows: FeaturedMatchRow[],
  slots: Pick<PollSlot, "id" | "start_time" | "end_time">[],
): FeaturedMatch[] {
  const slotByMatch = mapMatchesToSlots(rows, slots);

  const featured: FeaturedMatch[] = [];
  for (const row of rows) {
    const slotId = slotByMatch.get(row.id);
    if (!slotId) continue;
    featured.push({
      matchId: row.id,
      slotId,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
    });
  }
  return featured;
}

/** Groups featured matches by the slot they appear in. */
export function groupFeaturedBySlot(
  featured: FeaturedMatch[],
): Map<string, FeaturedMatch[]> {
  const bySlot = new Map<string, FeaturedMatch[]>();
  for (const match of featured) {
    const existing = bySlot.get(match.slotId);
    if (existing) existing.push(match);
    else bySlot.set(match.slotId, [match]);
  }
  return bySlot;
}

/**
 * Decides the featured flag for each match in a poll whose junction rows are
 * being rewritten wholesale.
 *
 * Matches already in the poll keep the per-poll choice the planner made by
 * hand; matches joining now inherit their match-level default. Without this,
 * a wholesale replace would silently reset every flag on any edit to a poll's
 * match list.
 */
export function resolveFeaturedOnReplace(
  matchIds: string[],
  currentRows: { matchId: string; featured: boolean }[],
  defaultsByMatchId: Map<string, boolean>,
): Map<string, boolean> {
  const alreadyInPoll = new Set(currentRows.map((row) => row.matchId));
  const previouslyFeatured = new Set(
    currentRows.filter((row) => row.featured).map((row) => row.matchId),
  );

  const resolved = new Map<string, boolean>();
  for (const matchId of matchIds) {
    resolved.set(
      matchId,
      alreadyInPoll.has(matchId)
        ? previouslyFeatured.has(matchId)
        : (defaultsByMatchId.get(matchId) ?? false),
    );
  }
  return resolved;
}
