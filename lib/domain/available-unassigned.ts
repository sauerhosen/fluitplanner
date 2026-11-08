import type {
  Assignment,
  AvailabilityResponse,
  Match,
} from "@/lib/types/domain";

export type DayAvailability = "yes" | "if_need_be";

type Input = {
  matches: Pick<Match, "id" | "date">[];
  /** Match id → the poll slot it falls in (see `mapMatchesToSlots`). */
  matchSlotMap: Map<string, string>;
  responses: Pick<AvailabilityResponse, "slot_id" | "umpire_id" | "response">[];
  /** Any status: a tentative appointment already plans the umpire in. */
  assignments: Pick<Assignment, "match_id" | "umpire_id">[];
  /**
   * Hidden matches are not being planned, so a "yes" for their slot alone
   * does not make an umpire usable that day. Their assignments still count.
   */
  hiddenMatchIds?: Set<string>;
};

/**
 * Per match date, the umpires who said yes / if need be to a slot of one of
 * that day's matches but have no assignment on that day yet — the bench the
 * planner can still draw from. "yes" wins over "if need be" when an umpire
 * gave both on the same day.
 */
export function findAvailableUnassigned({
  matches,
  matchSlotMap,
  responses,
  assignments,
  hiddenMatchIds,
}: Input): Map<string, Map<string, DayAvailability>> {
  const dateByMatch = new Map(matches.map((m) => [m.id, m.date]));

  const datesBySlot = new Map<string, Set<string>>();
  for (const m of matches) {
    if (hiddenMatchIds?.has(m.id)) continue;
    const slotId = matchSlotMap.get(m.id);
    if (!slotId) continue;
    if (!datesBySlot.has(slotId)) datesBySlot.set(slotId, new Set());
    datesBySlot.get(slotId)!.add(m.date);
  }

  const assignedByDate = new Map<string, Set<string>>();
  for (const a of assignments) {
    const date = dateByMatch.get(a.match_id);
    if (!date) continue;
    if (!assignedByDate.has(date)) assignedByDate.set(date, new Set());
    assignedByDate.get(date)!.add(a.umpire_id);
  }

  const result = new Map<string, Map<string, DayAvailability>>();
  for (const r of responses) {
    if (!r.umpire_id || r.response === "no") continue;
    for (const date of datesBySlot.get(r.slot_id) ?? []) {
      if (assignedByDate.get(date)?.has(r.umpire_id)) continue;
      if (!result.has(date)) result.set(date, new Map());
      const day = result.get(date)!;
      if (day.get(r.umpire_id) !== "yes") day.set(r.umpire_id, r.response);
    }
  }
  return result;
}
