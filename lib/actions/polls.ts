"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { diffSlots } from "@/lib/domain/diff-slots";
import type {
  Match,
  Poll,
  PollSlot,
  AvailabilityResponse,
  Assignment,
} from "@/lib/types/domain";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PollWithMeta = Poll & {
  response_count: number;
  match_date_min: string | null;
  match_date_max: string | null;
};

export type PollDetail = Poll & {
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/* ------------------------------------------------------------------ */
/*  getPollOptions (lightweight, for filter dropdowns)                  */
/* ------------------------------------------------------------------ */

export async function getPollOptions(): Promise<
  { id: string; title: string | null; status: string }[]
> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("polls")
    .select("id, title, status")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/*  getPolls                                                           */
/* ------------------------------------------------------------------ */

export async function getPolls(): Promise<PollWithMeta[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Fetch polls belonging to organization
  const { data: polls, error } = await supabase
    .from("polls")
    .select("*")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!polls || polls.length === 0) return [];

  const pollIds = polls.map((p: Poll) => p.id);

  // Fetch response counts (unique participant names per poll)
  const { data: responses, error: respError } = await supabase
    .from("availability_responses")
    .select("poll_id, participant_name")
    .in("poll_id", pollIds);

  if (respError) throw new Error(respError.message);

  const responseCounts = new Map<string, Set<string>>();
  for (const r of responses ?? []) {
    if (!responseCounts.has(r.poll_id)) {
      responseCounts.set(r.poll_id, new Set());
    }
    responseCounts.get(r.poll_id)!.add(r.participant_name);
  }

  // Fetch match date ranges via poll_matches -> matches
  const { data: pollMatches, error: pmError } = await supabase
    .from("poll_matches")
    .select("poll_id, match_id")
    .in("poll_id", pollIds);

  if (pmError) throw new Error(pmError.message);

  const matchIds = [
    ...new Set(
      (pollMatches ?? []).map((pm: { match_id: string }) => pm.match_id),
    ),
  ];

  let matchDateMap = new Map<string, string>();
  if (matchIds.length > 0) {
    const { data: matches, error: mError } = await supabase
      .from("matches")
      .select("id, date")
      .in("id", matchIds);

    if (mError) throw new Error(mError.message);
    matchDateMap = new Map(
      (matches ?? []).map((m: { id: string; date: string }) => [m.id, m.date]),
    );
  }

  // Group match dates by poll
  const pollDateRanges = new Map<
    string,
    { min: string | null; max: string | null }
  >();
  for (const pm of pollMatches ?? []) {
    const date = matchDateMap.get(pm.match_id);
    if (!date) continue;
    const existing = pollDateRanges.get(pm.poll_id) ?? {
      min: null,
      max: null,
    };
    if (!existing.min || date < existing.min) existing.min = date;
    if (!existing.max || date > existing.max) existing.max = date;
    pollDateRanges.set(pm.poll_id, existing);
  }

  return polls.map((p: Poll) => ({
    ...p,
    response_count: responseCounts.get(p.id)?.size ?? 0,
    match_date_min: pollDateRanges.get(p.id)?.min ?? null,
    match_date_max: pollDateRanges.get(p.id)?.max ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/*  getPoll                                                            */
/* ------------------------------------------------------------------ */

export async function getPoll(id: string): Promise<PollDetail> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Fetch poll (scoped to organization)
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id)
    .eq("organization_id", tenantId)
    .single();

  if (pollError) throw new Error(pollError.message);

  // Fetch poll_matches junction
  const { data: pollMatches, error: pmError } = await supabase
    .from("poll_matches")
    .select("match_id")
    .eq("poll_id", id);

  if (pmError) throw new Error(pmError.message);

  const matchIds = (pollMatches ?? []).map(
    (pm: { match_id: string }) => pm.match_id,
  );

  // Fetch actual matches
  let matches: Match[] = [];
  if (matchIds.length > 0) {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .in("id", matchIds)
      .order("date")
      .order("start_time");

    if (error) throw new Error(error.message);
    matches = data ?? [];
  }

  // Fetch slots
  const { data: slots, error: slotError } = await supabase
    .from("poll_slots")
    .select("*")
    .eq("poll_id", id)
    .order("start_time");

  if (slotError) throw new Error(slotError.message);

  // Fetch responses
  const { data: responses, error: respError } = await supabase
    .from("availability_responses")
    .select("*")
    .eq("poll_id", id)
    .order("created_at");

  if (respError) throw new Error(respError.message);

  // Fetch assignments
  const { data: assignments, error: assignError } = await supabase
    .from("assignments")
    .select("*")
    .eq("poll_id", id);

  if (assignError) throw new Error(assignError.message);

  return {
    ...poll,
    matches,
    slots: slots ?? [],
    responses: responses ?? [],
    assignments: assignments ?? [],
  };
}

/* ------------------------------------------------------------------ */
/*  getAvailableMatches                                                */
/* ------------------------------------------------------------------ */

export async function getAvailableMatches(
  excludePollId?: string,
): Promise<Match[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Get all matches for this organization
  const { data: allMatches, error: mError } = await supabase
    .from("matches")
    .select("*")
    .eq("organization_id", tenantId)
    .not("start_time", "is", null)
    .order("date")
    .order("start_time");

  if (mError) throw new Error(mError.message);

  // Get match IDs already in active polls (status = 'open')
  let query = supabase
    .from("poll_matches")
    .select("match_id, polls!inner(id, status, organization_id)")
    .eq("polls.status", "open")
    .eq("polls.organization_id", tenantId);

  if (excludePollId) {
    query = query.neq("polls.id", excludePollId);
  }

  const { data: usedMatches, error: pmError } = await query;

  if (pmError) throw new Error(pmError.message);

  const usedMatchIds = new Set(
    (usedMatches ?? []).map((pm: { match_id: string }) => pm.match_id),
  );

  return (allMatches ?? []).filter((m: Match) => !usedMatchIds.has(m.id));
}

/* ------------------------------------------------------------------ */
/*  createPoll                                                         */
/* ------------------------------------------------------------------ */

export async function createPoll(
  title: string,
  matchIds: string[],
): Promise<Poll> {
  if (!title.trim()) throw new Error("Title is required");
  if (matchIds.length === 0) throw new Error("At least one match is required");

  const { supabase, user } = await requireAuth();

  // Fetch match start times
  const { data: matches, error: mError } = await supabase
    .from("matches")
    .select("id, start_time")
    .in("id", matchIds);

  if (mError) throw new Error(mError.message);
  if (!matches || matches.length === 0) throw new Error("No matches found");

  const uniqueMatchIds = [...new Set(matchIds)];
  if (matches.length !== uniqueMatchIds.length) {
    throw new Error("One or more selected matches no longer exist");
  }

  // Calculate time slots
  const matchesWithTime = matches.filter(
    (m: { id: string; start_time: string | null }) => m.start_time !== null,
  ) as { id: string; start_time: string }[];
  const slots = groupMatchesIntoSlots(matchesWithTime);

  // Generate token
  const token = nanoid(12);

  const tenantId = await requireTenantId();

  // Insert poll
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .insert({
      title: title.trim(),
      token,
      status: "open",
      created_by: user.id,
      organization_id: tenantId,
    })
    .select()
    .single();

  if (pollError) throw new Error(pollError.message);

  // Insert poll_matches
  const pollMatchRows = matchIds.map((matchId) => ({
    poll_id: poll.id,
    match_id: matchId,
  }));

  const { error: pmError } = await supabase
    .from("poll_matches")
    .insert(pollMatchRows);

  if (pmError) throw new Error(pmError.message);

  // Insert poll_slots
  if (slots.length > 0) {
    const slotRows = slots.map((s) => ({
      poll_id: poll.id,
      start_time: s.start.toISOString(),
      end_time: s.end.toISOString(),
    }));

    const { error: slotError } = await supabase
      .from("poll_slots")
      .insert(slotRows);

    if (slotError) throw new Error(slotError.message);
  }

  revalidatePath("/protected/polls");
  return poll;
}

/* ------------------------------------------------------------------ */
/*  updatePollMatches                                                  */
/* ------------------------------------------------------------------ */

export async function updatePollMatches(
  pollId: string,
  matchIds: string[],
): Promise<void> {
  if (matchIds.length === 0) throw new Error("At least one match is required");

  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Verify poll belongs to this tenant
  const { data: poll, error: pollCheckError } = await supabase
    .from("polls")
    .select("id")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .single();

  if (pollCheckError || !poll) throw new Error("Poll not found");

  // Fetch and validate match start times
  const uniqueMatchIds = [...new Set(matchIds)];
  const { data: matches, error: mError } = await supabase
    .from("matches")
    .select("id, start_time")
    .in("id", uniqueMatchIds);

  if (mError) throw new Error(mError.message);

  if ((matches ?? []).length !== uniqueMatchIds.length) {
    throw new Error("One or more selected matches no longer exist");
  }

  const matchesWithTime = (matches ?? []).filter(
    (m: { id: string; start_time: string | null }) => m.start_time !== null,
  ) as { id: string; start_time: string }[];
  const desiredSlots = groupMatchesIntoSlots(matchesWithTime);

  // Get existing slots
  const { data: existingSlots, error: slotError } = await supabase
    .from("poll_slots")
    .select("*")
    .eq("poll_id", pollId);

  if (slotError) throw new Error(slotError.message);

  // Diff slots
  const { toAdd, toRemove } = diffSlots(existingSlots ?? [], desiredSlots);

  // Remove slots that are no longer needed
  if (toRemove.length > 0) {
    const removeIds = toRemove.map((s) => s.id);
    const { error } = await supabase
      .from("poll_slots")
      .delete()
      .in("id", removeIds);

    if (error) throw new Error(error.message);
  }

  // Add new slots
  if (toAdd.length > 0) {
    const slotRows = toAdd.map((s) => ({
      poll_id: pollId,
      start_time: s.start.toISOString(),
      end_time: s.end.toISOString(),
    }));

    const { error } = await supabase.from("poll_slots").insert(slotRows);

    if (error) throw new Error(error.message);
  }

  // Replace poll_matches: delete old, insert new
  const { error: deleteError } = await supabase
    .from("poll_matches")
    .delete()
    .eq("poll_id", pollId);

  if (deleteError) throw new Error(deleteError.message);

  const pollMatchRows = matchIds.map((matchId) => ({
    poll_id: pollId,
    match_id: matchId,
  }));

  const { error: insertError } = await supabase
    .from("poll_matches")
    .insert(pollMatchRows);

  if (insertError) throw new Error(insertError.message);
  revalidatePath("/protected/polls");
}

/* ------------------------------------------------------------------ */
/*  updatePollTitle                                                    */
/* ------------------------------------------------------------------ */

export async function updatePollTitle(
  pollId: string,
  title: string,
): Promise<Poll> {
  if (!title.trim()) throw new Error("Title is required");

  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("polls")
    .update({ title: title.trim() })
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/protected/polls");
  return data;
}

/* ------------------------------------------------------------------ */
/*  togglePollStatus                                                   */
/* ------------------------------------------------------------------ */

export async function togglePollStatus(pollId: string): Promise<Poll> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Fetch current status
  const { data: current, error: fetchError } = await supabase
    .from("polls")
    .select("status")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const newStatus = current.status === "open" ? "closed" : "open";

  const { data, error } = await supabase
    .from("polls")
    .update({ status: newStatus })
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/protected/polls");
  return data;
}

/* ------------------------------------------------------------------ */
/*  deletePoll                                                         */
/* ------------------------------------------------------------------ */

export async function deletePoll(pollId: string): Promise<void> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { error } = await supabase
    .from("polls")
    .delete()
    .eq("id", pollId)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/polls");
}

export async function deletePolls(pollIds: string[]): Promise<void> {
  if (pollIds.length === 0) return;
  if (pollIds.length > 500)
    throw new Error("Cannot delete more than 500 items at once");
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { error } = await supabase
    .from("polls")
    .delete()
    .in("id", pollIds)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/protected/polls");
}

/* ------------------------------------------------------------------ */
/*  addMatchesToPoll                                                    */
/* ------------------------------------------------------------------ */

export async function addMatchesToPoll(
  pollId: string,
  matchIds: string[],
): Promise<void> {
  if (matchIds.length === 0) throw new Error("No matches provided");
  if (matchIds.length > 500)
    throw new Error("Cannot add more than 500 matches at once");

  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Verify poll belongs to tenant and is open
  const { data: poll, error: pollErr } = await supabase
    .from("polls")
    .select("id, status")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .single();

  if (pollErr || !poll) throw new Error("Poll not found");
  if (poll.status !== "open") throw new Error("Poll is closed");

  // Get existing match IDs for this poll
  const { data: existingPm, error: pmErr } = await supabase
    .from("poll_matches")
    .select("match_id")
    .eq("poll_id", pollId);

  if (pmErr) throw new Error(pmErr.message);

  const existingMatchIds = (existingPm ?? []).map(
    (pm: { match_id: string }) => pm.match_id,
  );
  const mergedIds = [...new Set([...existingMatchIds, ...matchIds])];

  // Delegate to updatePollMatches which handles slot recalculation
  await updatePollMatches(pollId, mergedIds);

  revalidatePath("/protected/matches");
}

/* ------------------------------------------------------------------ */
/*  removeMatchesFromPolls                                              */
/* ------------------------------------------------------------------ */

export async function removeMatchesFromPolls(
  matchIds: string[],
  keepEmptyPolls = false,
): Promise<void> {
  if (matchIds.length === 0) return;
  if (matchIds.length > 500)
    throw new Error("Cannot remove more than 500 items at once");

  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Find which polls are affected (scoped to tenant)
  const { data: affectedPm, error: pmErr } = await supabase
    .from("poll_matches")
    .select("poll_id, match_id, polls!inner(organization_id)")
    .in("match_id", matchIds)
    .eq("polls.organization_id", tenantId);

  if (pmErr) throw new Error(pmErr.message);
  if (!affectedPm || affectedPm.length === 0) return;

  // Group removed match IDs by poll
  const matchIdsToRemove = new Set(matchIds);
  const affectedPollIds = [
    ...new Set(affectedPm.map((pm: { poll_id: string }) => pm.poll_id)),
  ];

  for (const pollId of affectedPollIds) {
    // Get all current matches for this poll
    const { data: currentPm, error: curErr } = await supabase
      .from("poll_matches")
      .select("match_id")
      .eq("poll_id", pollId);

    if (curErr) throw new Error(curErr.message);

    const remainingIds = (currentPm ?? [])
      .map((pm: { match_id: string }) => pm.match_id)
      .filter((id: string) => !matchIdsToRemove.has(id));

    if (remainingIds.length === 0 && !keepEmptyPolls) {
      // Delete poll entirely (cascade removes poll_matches, poll_slots)
      await deletePoll(pollId);
    } else if (remainingIds.length === 0 && keepEmptyPolls) {
      // Remove all poll_matches and poll_slots but keep the poll
      const { error: delPmErr } = await supabase
        .from("poll_matches")
        .delete()
        .eq("poll_id", pollId);
      if (delPmErr) throw new Error(delPmErr.message);

      const { error: delSlotErr } = await supabase
        .from("poll_slots")
        .delete()
        .eq("poll_id", pollId);
      if (delSlotErr) throw new Error(delSlotErr.message);
    } else {
      // Update poll with remaining matches (recalculates slots)
      await updatePollMatches(pollId, remainingIds);
    }
  }

  revalidatePath("/protected/matches");
  revalidatePath("/protected/polls");
}
