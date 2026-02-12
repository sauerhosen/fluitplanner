import type { TimeSlot } from "@/lib/types/domain";

export function calculateSlot(matchTime: Date): TimeSlot {
  const ms = matchTime.getTime();
  const thirtyMinMs = 30 * 60 * 1000;
  const fifteenMinMs = 15 * 60 * 1000;
  const twoHoursMs = 2 * 60 * 60 * 1000;

  const shifted = ms - thirtyMinMs;
  const start = shifted - (shifted % fifteenMinMs);
  const end = start + twoHoursMs;

  return { start: new Date(start), end: new Date(end) };
}

export function groupMatchesIntoSlots(
  matches: { start_time: string | Date }[],
): TimeSlot[] {
  if (matches.length === 0) return [];

  const slots = matches.map((m) => {
    const time =
      typeof m.start_time === "string" ? new Date(m.start_time) : m.start_time;
    return calculateSlot(time);
  });

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: TimeSlot[] = [{ ...slots[0] }];

  for (let i = 1; i < slots.length; i++) {
    const current = slots[i];
    const group = merged[merged.length - 1];
    const diffMs = current.start.getTime() - group.start.getTime();
    const fifteenMinMs = 15 * 60 * 1000;

    if (diffMs <= fifteenMinMs) {
      if (current.end.getTime() > group.end.getTime()) {
        group.end = new Date(current.end.getTime());
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}
