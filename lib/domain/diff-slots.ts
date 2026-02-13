import type { PollSlot, TimeSlot } from "@/lib/types/domain";

export type SlotDiff = {
  toAdd: TimeSlot[];
  toRemove: PollSlot[];
  toKeep: PollSlot[];
};

export function diffSlots(existing: PollSlot[], desired: TimeSlot[]): SlotDiff {
  const toAdd: TimeSlot[] = [];
  const toRemove: PollSlot[] = [];
  const toKeep: PollSlot[] = [];

  const existingMap = new Map(
    existing.map((s) => [
      `${new Date(s.start_time).getTime()}-${new Date(s.end_time).getTime()}`,
      s,
    ]),
  );

  for (const slot of desired) {
    const key = `${slot.start.getTime()}-${slot.end.getTime()}`;
    const match = existingMap.get(key);
    if (match) {
      toKeep.push(match);
      existingMap.delete(key);
    } else {
      toAdd.push(slot);
    }
  }

  for (const remaining of existingMap.values()) {
    toRemove.push(remaining);
  }

  return { toAdd, toRemove, toKeep };
}
