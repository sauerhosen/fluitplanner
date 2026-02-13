import type { Match, PollSlot } from "@/lib/types/domain";

/**
 * Maps each match to the poll slot that contains its start time.
 * Returns a Map of matchId -> slotId.
 */
export function mapMatchesToSlots(
  matches: Match[],
  slots: PollSlot[],
): Map<string, string> {
  const result = new Map<string, string>();

  for (const match of matches) {
    if (!match.start_time) continue;

    const matchTime = new Date(match.start_time).getTime();

    for (const slot of slots) {
      const slotStart = new Date(slot.start_time).getTime();
      const slotEnd = new Date(slot.end_time).getTime();

      if (matchTime >= slotStart && matchTime < slotEnd) {
        result.set(match.id, slot.id);
        break;
      }
    }
  }

  return result;
}
