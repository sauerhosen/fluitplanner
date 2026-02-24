"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import type { AvailabilityLockMode, Match, PollSlot } from "@/lib/types/domain";

export type AssignedSlotInfo = {
  slotId: string;
  matches: { matchId: string; homeTeam: string; awayTeam: string }[];
};

export type PollAssignmentContext = {
  lockMode: AvailabilityLockMode;
  assignedSlots: AssignedSlotInfo[];
};

/**
 * For a given poll and umpire, returns which slots have assignments
 * and what the organization's lock mode is.
 * Uses service role to bypass RLS (assignments table has no anon policy).
 */
export async function getPollAssignmentContext(
  pollId: string,
  umpireId: string,
): Promise<PollAssignmentContext> {
  const supabase = createServiceClient();

  // 1. Get the poll's organization_id
  const { data: poll } = await supabase
    .from("polls")
    .select("organization_id")
    .eq("id", pollId)
    .single();

  if (!poll) {
    return { lockMode: "warn", assignedSlots: [] };
  }

  // 2. Get organization settings
  const { data: settings } = await supabase
    .from("organization_settings")
    .select("availability_lock_mode")
    .eq("organization_id", poll.organization_id)
    .single();

  const lockMode: AvailabilityLockMode =
    (settings?.availability_lock_mode as AvailabilityLockMode) ?? "warn";

  // 3. Get assignments for this umpire in this poll
  const { data: assignments } = await supabase
    .from("assignments")
    .select("match_id")
    .eq("poll_id", pollId)
    .eq("umpire_id", umpireId);

  if (!assignments || assignments.length === 0) {
    return { lockMode, assignedSlots: [] };
  }

  // 4. Get matches and slots to build mapping
  const matchIds = assignments.map((a) => a.match_id);

  const { data: matches } = await supabase
    .from("matches")
    .select("id, date, start_time, home_team, away_team")
    .in("id", matchIds);

  const { data: slots } = await supabase
    .from("poll_slots")
    .select("id, poll_id, start_time, end_time")
    .eq("poll_id", pollId);

  if (!matches || !slots) {
    return { lockMode, assignedSlots: [] };
  }

  // 5. Map matches to slots using existing domain function
  const matchToSlot = mapMatchesToSlots(
    matches as Match[],
    slots as PollSlot[],
  );

  // 6. Build slotId -> match info map
  const slotMap = new Map<
    string,
    { matchId: string; homeTeam: string; awayTeam: string }[]
  >();

  for (const match of matches) {
    const slotId = matchToSlot.get(match.id);
    if (!slotId) continue;

    const existing = slotMap.get(slotId) ?? [];
    existing.push({
      matchId: match.id,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
    });
    slotMap.set(slotId, existing);
  }

  const assignedSlots: AssignedSlotInfo[] = Array.from(slotMap.entries()).map(
    ([slotId, matchInfos]) => ({
      slotId,
      matches: matchInfos,
    }),
  );

  return { lockMode, assignedSlots };
}
