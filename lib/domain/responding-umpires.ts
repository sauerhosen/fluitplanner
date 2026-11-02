/**
 * Narrow a roster to the umpires worth a row for the days in view: those who
 * answered at least one slot shown (a "no" is an answer too), plus anyone
 * already assigned to a match shown — hiding them would hide the assignment.
 *
 * Roster order is kept.
 */
export function onlyRespondingUmpires<T extends { id: string }>(
  umpires: T[],
  slotIds: Iterable<string>,
  responses: { slot_id: string; umpire_id: string | null; response?: string }[],
  assignments: { match_id: string; umpire_id: string }[],
  matchIds: Iterable<string>,
): T[] {
  const slots = new Set(slotIds);
  const matches = new Set(matchIds);
  const keep = new Set<string>();
  for (const r of responses) {
    if (r.umpire_id && slots.has(r.slot_id)) keep.add(r.umpire_id);
  }
  for (const a of assignments) {
    if (matches.has(a.match_id)) keep.add(a.umpire_id);
  }
  return umpires.filter((u) => keep.has(u.id));
}
