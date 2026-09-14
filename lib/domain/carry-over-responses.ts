import { diffSlots } from "@/lib/domain/diff-slots";
import type {
  AvailabilityResponse,
  PollSlot,
  TimeSlot,
} from "@/lib/types/domain";

/**
 * How far a slot's start and end may each move and still count as the same
 * question to an umpire. Slot windows are quarter-hour aligned and merge when
 * starts are at most 15 minutes apart, so adding or removing a nearby match
 * shifts a window by exactly this much — any further is a different window.
 */
export const MAX_SLOT_SHIFT_MS = 15 * 60 * 1000;

type SlotWindow = Pick<PollSlot, "id" | "start_time" | "end_time">;
type CarriableResponse = Pick<
  AvailabilityResponse,
  "slot_id" | "umpire_id" | "participant_name"
>;

/** Total distance between two windows, or null when they are too far apart. */
function shift(a: SlotWindow, b: SlotWindow): number | null {
  const startShift = Math.abs(
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const endShift = Math.abs(
    new Date(a.end_time).getTime() - new Date(b.end_time).getTime(),
  );
  if (startShift > MAX_SLOT_SHIFT_MS || endShift > MAX_SLOT_SHIFT_MS) {
    return null;
  }
  return startShift + endShift;
}

const answererKey = (r: CarriableResponse) =>
  r.umpire_id ?? `name:${r.participant_name}`;

/**
 * The slots among `candidates` that could inherit answers from a removed slot.
 * Callers use it to fetch only the answers the carry-over needs to see.
 */
export function carryOverCandidates<S extends SlotWindow>(
  removed: SlotWindow[],
  candidates: S[],
): S[] {
  return candidates.filter((c) => removed.some((r) => shift(r, c) !== null));
}

/**
 * Recomputing a poll's slots replaces any slot whose window moved, and
 * deleting it cascades its answers away. This decides which of those answers
 * survive: each is copied onto a slot (new or kept) whose window moved at most
 * a quarter hour, unless the umpire already answered for that slot.
 *
 * `responses` must include the answers on `removed` and on `targets`; answers
 * on other slots are ignored. `carried` are the copies to insert (source row
 * with its `slot_id` swapped); `discarded` are the answers on removed slots
 * the umpire now has no stand-in for.
 */
export function planResponseCarryOver<R extends CarriableResponse>(
  removed: SlotWindow[],
  targets: SlotWindow[],
  responses: R[],
): { carried: R[]; discarded: R[] } {
  const removedIds = new Set(removed.map((s) => s.id));
  const bySlot = new Map<string, Map<string, R>>();
  for (const r of responses) {
    const slotAnswers = bySlot.get(r.slot_id) ?? new Map<string, R>();
    slotAnswers.set(answererKey(r), r);
    bySlot.set(r.slot_id, slotAnswers);
  }

  const carried: R[] = [];
  // Which umpires still have an answer for each removed slot's window.
  const covered = new Map<string, Set<string>>();

  for (const target of targets) {
    if (removedIds.has(target.id)) continue;
    const sources = removed
      .map((source) => ({ source, distance: shift(source, target) }))
      .filter(
        (s): s is { source: SlotWindow; distance: number } =>
          s.distance !== null,
      )
      .sort((a, b) => a.distance - b.distance);
    if (sources.length === 0) continue;

    const alreadyAnswered = bySlot.get(target.id) ?? new Map<string, R>();
    const taken = new Set<string>();

    for (const { source } of sources) {
      const sourceCovered = covered.get(source.id) ?? new Set<string>();
      covered.set(source.id, sourceCovered);

      for (const [key, response] of bySlot.get(source.id) ?? []) {
        sourceCovered.add(key);
        if (alreadyAnswered.has(key) || taken.has(key)) continue;
        taken.add(key);
        carried.push({ ...response, slot_id: target.id });
      }
    }
  }

  const discarded = responses.filter(
    (r) =>
      removedIds.has(r.slot_id) && !covered.get(r.slot_id)?.has(answererKey(r)),
  );

  return { carried, discarded };
}

/**
 * How many answers saving `desired` as the poll's slots would throw away —
 * the same diff and carry-over the save performs, for a warning beforehand.
 */
export function countDiscardedResponses(
  existing: PollSlot[],
  desired: TimeSlot[],
  responses: CarriableResponse[],
): number {
  const { toAdd, toRemove, toKeep } = diffSlots(existing, desired);
  const targets: SlotWindow[] = [
    ...toKeep,
    ...toAdd.map((s, i) => ({
      id: `pending-${i}`,
      start_time: s.start.toISOString(),
      end_time: s.end.toISOString(),
    })),
  ];
  return planResponseCarryOver(toRemove, targets, responses).discarded.length;
}
