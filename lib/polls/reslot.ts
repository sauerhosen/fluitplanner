import type { SupabaseClient } from "@supabase/supabase-js";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { diffSlots } from "@/lib/domain/diff-slots";
import {
  carryOverCandidates,
  planResponseCarryOver,
} from "@/lib/domain/carry-over-responses";
import {
  batches,
  deleteInBatches,
  selectAllPages,
  selectInBatches,
  throwDb,
} from "@/lib/supabase/batching";
import type { AvailabilityResponse, PollSlot } from "@/lib/types/domain";

/**
 * A poll's slots are derived from its matches' kick-offs. This module keeps
 * them in step: on any change to the poll's match list, and when a kick-off
 * moves (Hockey.nl sync, the match form, a file import, the MCP server) or a
 * match is deleted. Works on either client — the planner's RLS-bound one or
 * the service client — and always filters by organization explicitly.
 */

export type SlotReconcileResult = {
  matchesWithTime: Set<string>;
  slotsAdded: number;
  slotsRemoved: number;
  carriedResponses: number;
  discardedResponses: number;
};

/**
 * Recompute the poll's slot set over its (final) match ids and diff-apply it
 * — the operation behind every change to a poll's matches, and behind a
 * match's kick-off moving (see reslotOpenPolls). Slots
 * whose window disappears are deleted (their answers cascade away), but an
 * answer first moves onto a slot whose window only shifted by a quarter hour
 * (see planResponseCarryOver). What is left discarded is counted so callers
 * can report who to re-ask.
 *
 * Callers settle poll_matches membership BEFORE calling this: if a later
 * step fails, the residue is then stale slots with answers intact rather
 * than destroyed answers for matches still in the poll.
 */
export async function reconcilePollSlots(
  client: SupabaseClient,
  organizationId: string,
  pollId: string,
  matchIds: string[],
): Promise<SlotReconcileResult> {
  const matchRows = await loadMatchTimes(client, organizationId, matchIds);
  const withTime = matchRows.filter((m) => m.start_time !== null) as {
    id: string;
    start_time: string;
  }[];
  return applySlots(client, pollId, withTime);
}

type MatchTime = { id: string; start_time: string | null };

function loadMatchTimes(
  client: SupabaseClient,
  organizationId: string,
  matchIds: string[],
): Promise<MatchTime[]> {
  return selectInBatches<MatchTime>(matchIds, (batch) =>
    client
      .from("matches")
      .select("id, start_time")
      .in("id", batch)
      .eq("organization_id", organizationId),
  );
}

/** Diff-apply the slot set the timed matches call for (see reconcilePollSlots). */
async function applySlots(
  client: SupabaseClient,
  pollId: string,
  withTime: { id: string; start_time: string }[],
): Promise<SlotReconcileResult> {
  const desiredSlots = groupMatchesIntoSlots(withTime);

  const { data: existingSlots, error: slotError } = await client
    .from("poll_slots")
    .select("*")
    .eq("poll_id", pollId);
  throwDb(slotError);
  const { toAdd, toRemove, toKeep } = diffSlots(
    (existingSlots ?? []) as PollSlot[],
    desiredSlots,
  );

  // Destructive step last: insert the new windows, copy the answers that
  // carry over onto them, and delete the stale slots (and, via ON DELETE
  // CASCADE, their remaining answers) only at the end — a failure part-way
  // leaves overlapping slots with every answer intact. poll_slots has no
  // uniqueness constraint, so the briefly coexisting old and new slots are
  // harmless, and a retry carries onto the already-inserted windows.
  let insertedSlots: PollSlot[] = [];
  if (toAdd.length > 0) {
    const { data, error } = await client
      .from("poll_slots")
      .insert(
        toAdd.map((s) => ({
          poll_id: pollId,
          start_time: s.start.toISOString(),
          end_time: s.end.toISOString(),
        })),
      )
      .select("*");
    throwDb(error);
    insertedSlots = (data ?? []) as PollSlot[];
  }

  let carriedResponses = 0;
  let discardedResponses = 0;
  if (toRemove.length > 0) {
    const removeSlotIds = toRemove.map((s) => s.id);
    const targets = carryOverCandidates(toRemove, [
      ...insertedSlots,
      ...toKeep,
    ]);
    const readSlotIds = [...removeSlotIds, ...targets.map((s) => s.id)];
    // A batch of slots can hold more answers than one response page.
    const responses: AvailabilityResponse[] = [];
    for (const batch of batches(readSlotIds)) {
      responses.push(
        ...(await selectAllPages<AvailabilityResponse>((from, to) =>
          client
            .from("availability_responses")
            .select("*")
            .in("slot_id", batch)
            .order("id")
            .range(from, to),
        )),
      );
    }

    const { carried, discarded } = planResponseCarryOver(
      toRemove,
      targets,
      responses,
    );
    if (carried.length > 0) {
      const { error } = await client.from("availability_responses").insert(
        // A fresh id per copy: the originals cascade away with their slot.
        carried.map((r) => ({
          poll_id: r.poll_id,
          slot_id: r.slot_id,
          umpire_id: r.umpire_id,
          participant_name: r.participant_name,
          response: r.response,
          created_at: r.created_at,
          updated_at: r.updated_at,
        })),
      );
      throwDb(error);
    }
    carriedResponses = carried.length;
    discardedResponses = discarded.length;

    await deleteInBatches(removeSlotIds, (batch) =>
      client.from("poll_slots").delete().in("id", batch),
    );
  }

  return {
    matchesWithTime: new Set(withTime.map((m) => m.id)),
    slotsAdded: toAdd.length,
    slotsRemoved: toRemove.length,
    carriedResponses,
    discardedResponses,
  };
}

export type PollReslot =
  | ({ pollId: string; skipped?: undefined } & Omit<
      SlotReconcileResult,
      "matchesWithTime"
    >)
  | { pollId: string; skipped: "match_without_time" };

/** The open polls of this organization that contain any of the matches. */
export async function findOpenPollsForMatches(
  client: SupabaseClient,
  organizationId: string,
  matchIds: string[],
): Promise<string[]> {
  if (matchIds.length === 0) return [];
  const links = await selectInBatches<{ poll_id: string }>(
    [...new Set(matchIds)],
    (batch) =>
      client.from("poll_matches").select("poll_id").in("match_id", batch),
  );
  const pollIds = [...new Set(links.map((l) => l.poll_id))];
  if (pollIds.length === 0) return [];
  const polls = await selectInBatches<{ id: string }>(pollIds, (batch) =>
    client
      .from("polls")
      .select("id")
      .in("id", batch)
      .eq("organization_id", organizationId)
      .eq("status", "open"),
  );
  return polls.map((p) => p.id);
}

/**
 * Recompute the slots of the given polls from their matches' current
 * kick-offs. Only open polls are touched: a closed poll's answers can no
 * longer be given again, so its slots are left exactly as umpires saw them.
 *
 * A poll is skipped while one of its matches has no kick-off — the sync
 * clears a time Hockey.nl retracts, and it usually returns. Recomputing then
 * would drop that match's slot and every answer on it; the stale slot is the
 * smaller harm until the time is known again.
 */
export async function reslotOpenPolls(
  client: SupabaseClient,
  organizationId: string,
  pollIds: string[],
): Promise<PollReslot[]> {
  const unique = [...new Set(pollIds)];
  if (unique.length === 0) return [];
  const open = await selectInBatches<{ id: string }>(unique, (batch) =>
    client
      .from("polls")
      .select("id")
      .in("id", batch)
      .eq("organization_id", organizationId)
      .eq("status", "open"),
  );
  return reslotPolls(
    client,
    organizationId,
    open.map((p) => p.id),
  );
}

/** reslotOpenPolls over ids already known to be this organization's open polls. */
async function reslotPolls(
  client: SupabaseClient,
  organizationId: string,
  openPollIds: string[],
): Promise<PollReslot[]> {
  const results: PollReslot[] = [];
  for (const pollId of openPollIds) {
    const { data: links, error: linkError } = await client
      .from("poll_matches")
      .select("match_id")
      .eq("poll_id", pollId);
    throwDb(linkError);
    const matchIds = (links ?? []).map((l: { match_id: string }) => l.match_id);
    // A poll whose last match is gone asks about nothing: every slot goes,
    // as when a planner removes the poll's last match by hand.
    const matches =
      matchIds.length === 0
        ? []
        : await loadMatchTimes(client, organizationId, matchIds);
    if (matches.some((m) => m.start_time === null)) {
      results.push({ pollId, skipped: "match_without_time" });
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { matchesWithTime, ...counts } = await applySlots(
      client,
      pollId,
      matches as { id: string; start_time: string }[],
    );
    results.push({ pollId, ...counts });
  }
  return results;
}

/** Reslot every open poll that contains one of the matches. */
export async function reslotPollsForMatches(
  client: SupabaseClient,
  organizationId: string,
  matchIds: string[],
): Promise<PollReslot[]> {
  const pollIds = await findOpenPollsForMatches(
    client,
    organizationId,
    matchIds,
  );
  // findOpenPollsForMatches already kept only this organization's open polls.
  return reslotPolls(client, organizationId, pollIds);
}

type AppliedReslot = Extract<PollReslot, { skipped?: undefined }>;

/** Polls whose slot set actually changed. */
export function changedPolls(results: PollReslot[]): AppliedReslot[] {
  return results.filter(
    (r): r is AppliedReslot =>
      !r.skipped && (r.slotsAdded > 0 || r.slotsRemoved > 0),
  );
}
