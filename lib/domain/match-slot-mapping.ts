import { calculateSlot } from "@/lib/domain/slots";
import type { Match, PollSlot } from "@/lib/types/domain";

/** Only the fields the mapping actually reads, so narrow query rows fit too. */
type MatchTiming = Pick<Match, "id" | "start_time">;
type SlotWindow = Pick<PollSlot, "id" | "start_time" | "end_time">;

/**
 * Maps each match to the poll slot it belongs to. Returns a Map of
 * matchId -> slotId.
 *
 * Slots are two hours long but can start 15 minutes apart, so a match's start
 * time usually falls inside several slots. "First slot containing the start"
 * is therefore wrong: a 10:45 match would land in a 09:45 slot instead of its
 * own 10:15 one. Instead, among the slots containing the match start, pick the
 * one generated for it — the latest slot starting at or before the match's
 * computed slot start (`groupMatchesIntoSlots` may have merged that slot into
 * an earlier one). If every containing slot starts later (slots that no longer
 * match the generation rule), fall back to the earliest of them.
 */
export function mapMatchesToSlots(
  matches: MatchTiming[],
  slots: SlotWindow[],
): Map<string, string> {
  const result = new Map<string, string>();

  const windows = slots
    .map((slot) => ({
      id: slot.id,
      start: new Date(slot.start_time).getTime(),
      end: new Date(slot.end_time).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  for (const match of matches) {
    if (!match.start_time) continue;

    const matchDate = new Date(match.start_time);
    const matchTime = matchDate.getTime();
    const ownSlotStart = calculateSlot(matchDate).start.getTime();

    // Windows are sorted by start: keep the latest containing one that starts
    // at or before ownSlotStart, else the first (earliest) containing one.
    let chosen: (typeof windows)[number] | undefined;
    for (const w of windows) {
      if (w.start > matchTime) break;
      if (matchTime >= w.end) continue;
      if (!chosen || w.start <= ownSlotStart) chosen = w;
    }

    if (chosen) result.set(match.id, chosen.id);
  }

  return result;
}
