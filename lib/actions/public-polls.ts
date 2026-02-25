"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import { getTenantId } from "@/lib/tenant";
import {
  isAvailabilityLockMode,
  type Poll,
  type PollSlot,
  type Match,
  type Umpire,
  type AvailabilityResponse,
  type AvailabilityLockMode,
  type SubmitResponsesResult,
} from "@/lib/types/domain";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PublicPollData = {
  poll: Poll;
  slots: PollSlot[];
};

export type ResponseInput = {
  slotId: string;
  response: "yes" | "if_need_be" | "no";
};

/* ------------------------------------------------------------------ */
/*  getPollByToken                                                     */
/* ------------------------------------------------------------------ */

export async function getPollByToken(
  token: string,
): Promise<PublicPollData | null> {
  const supabase = await createClient();

  let query = supabase.from("polls").select("*").eq("token", token);

  // Add organization scoping if tenant context is available (defense in depth)
  const tenantId = await getTenantId();
  if (tenantId) {
    query = query.eq("organization_id", tenantId);
  }

  const { data: poll, error: pollError } = await query.single();

  if (pollError || !poll) return null;

  const { data: slots, error: slotsError } = await supabase
    .from("poll_slots")
    .select("*")
    .eq("poll_id", poll.id)
    .order("start_time");

  if (slotsError) return null;

  return { poll, slots: slots ?? [] };
}

/* ------------------------------------------------------------------ */
/*  findOrCreateUmpire                                                 */
/* ------------------------------------------------------------------ */

export async function findOrCreateUmpire(
  email: string,
  name?: string,
  pollId?: string,
): Promise<Umpire | null> {
  const supabase = await createClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (!error && existing) {
    // Link existing umpire to the poll's organization if not already linked
    if (pollId) await linkUmpireToOrg(supabase, existing.id, pollId);
    return existing;
  }

  // Not found — need a name to create
  if (!name) return null;

  const { data: created, error: insertError } = await supabase
    .from("umpires")
    .insert({ name: name.trim(), email: normalizedEmail, level: 1 })
    .select()
    .single();

  if (insertError || !created) return null;

  // Link new umpire to the poll's organization
  if (pollId) await linkUmpireToOrg(supabase, created.id, pollId);
  return created;
}

async function linkUmpireToOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  umpireId: string,
  pollId: string,
): Promise<void> {
  const { data: poll } = await supabase
    .from("polls")
    .select("organization_id")
    .eq("id", pollId)
    .single();

  if (!poll?.organization_id) return;

  await supabase
    .from("organization_umpires")
    .upsert(
      { organization_id: poll.organization_id, umpire_id: umpireId },
      { onConflict: "organization_id,umpire_id" },
    );
}

/* ------------------------------------------------------------------ */
/*  findUmpireById                                                     */
/* ------------------------------------------------------------------ */

export async function findUmpireById(id: string): Promise<Umpire | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("umpires")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

/* ------------------------------------------------------------------ */
/*  getMyResponses                                                     */
/* ------------------------------------------------------------------ */

export async function getMyResponses(
  pollId: string,
  umpireId: string,
): Promise<AvailabilityResponse[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("availability_responses")
    .select("*")
    .eq("poll_id", pollId)
    .eq("umpire_id", umpireId);

  if (error) return [];
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/*  submitResponses                                                    */
/* ------------------------------------------------------------------ */

export async function submitResponses(
  pollId: string,
  umpireId: string,
  participantName: string,
  responses: ResponseInput[],
): Promise<SubmitResponsesResult> {
  if (responses.length === 0) return { status: "saved" };

  const supabase = await createClient();

  // Verify poll is open
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("status")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) throw new Error("Poll not found");
  if (poll.status === "closed") throw new Error("Poll is closed");

  // Check for assignment conflicts (uses service client to bypass RLS)
  const conflictResult = await checkAssignmentConflicts(
    pollId,
    umpireId,
    responses,
  );

  // Determine which responses to actually save
  let toSave = responses;
  if (conflictResult) {
    if (conflictResult.lockMode === "lock") {
      // Partial save: filter out blocked slots, save the rest
      const blockedSlotIds = new Set(
        conflictResult.conflicts.map((c) => c.slotId),
      );
      toSave = responses.filter((r) => !blockedSlotIds.has(r.slotId));
    }
    // In warn mode, save everything (user already confirmed via dialog)
  }

  // Upsert responses (may be empty if all were blocked)
  if (toSave.length > 0) {
    const rows = toSave.map((r) => ({
      poll_id: pollId,
      slot_id: r.slotId,
      participant_name: participantName,
      response: r.response,
      umpire_id: umpireId,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("availability_responses")
      .upsert(rows, { onConflict: "poll_id,slot_id,umpire_id" });

    if (error) throw new Error(error.message);
  }

  // Return partial_saved result when lock mode blocked some slots
  if (
    conflictResult?.lockMode === "lock" &&
    conflictResult.conflicts.length > 0
  ) {
    return {
      status: "partial_saved",
      blockedSlots: conflictResult.conflicts.map((c) => ({
        slotId: c.slotId,
        matchLabels: c.matchLabels,
      })),
    };
  }

  return { status: "saved" };
}

/* ------------------------------------------------------------------ */
/*  checkAssignmentConflicts (internal)                                */
/* ------------------------------------------------------------------ */

type ConflictInfo = {
  slotId: string;
  matchIds: string[];
  matchLabels: string[];
  previousResponse: "yes" | "if_need_be";
};

type ConflictResult = {
  lockMode: AvailabilityLockMode;
  conflicts: ConflictInfo[];
  organizationId: string;
};

/**
 * Checks if new responses would downgrade availability for assigned slots.
 * Uses service role client to bypass RLS (assignments table has no anon policy).
 *
 * Returns null if no conflicts, otherwise returns conflict details.
 * In both modes, logs to availability_override_logs for audit trail.
 */
async function checkAssignmentConflicts(
  pollId: string,
  umpireId: string,
  newResponses: ResponseInput[],
): Promise<ConflictResult | null> {
  const serviceClient = createServiceClient();

  // Get assignments for this umpire in this poll
  const { data: assignments, error: assignErr } = await serviceClient
    .from("assignments")
    .select("match_id")
    .eq("poll_id", pollId)
    .eq("umpire_id", umpireId);

  if (assignErr) throw new Error("Failed to check assignments");
  if (!assignments || assignments.length === 0) return null;

  // Get current (saved) responses for this umpire
  const { data: currentResponses, error: respErr } = await serviceClient
    .from("availability_responses")
    .select("slot_id, response")
    .eq("poll_id", pollId)
    .eq("umpire_id", umpireId);

  if (respErr) throw new Error("Failed to check current responses");

  // Build a map of current slot responses
  const currentMap = new Map<string, string>();
  for (const r of currentResponses ?? []) {
    currentMap.set(r.slot_id, r.response);
  }

  // Get matches and slots to build the match->slot mapping
  const matchIds = assignments.map((a) => a.match_id);

  const { data: matches, error: matchErr } = await serviceClient
    .from("matches")
    .select("id, date, start_time, home_team, away_team")
    .in("id", matchIds);

  const { data: slots, error: slotErr } = await serviceClient
    .from("poll_slots")
    .select("id, poll_id, start_time, end_time")
    .eq("poll_id", pollId);

  if (matchErr || slotErr) throw new Error("Failed to load match/slot data");
  if (!matches || !slots) return null;

  const matchToSlot = mapMatchesToSlots(
    matches as Match[],
    slots as PollSlot[],
  );

  // Build slot->match info map for assigned slots
  const assignedSlotMatches = new Map<
    string,
    { matchIds: string[]; matchLabels: string[] }
  >();
  for (const assignment of assignments) {
    const slotId = matchToSlot.get(assignment.match_id);
    if (!slotId) continue;
    const match = matches.find((m) => m.id === assignment.match_id);
    const existing = assignedSlotMatches.get(slotId) ?? {
      matchIds: [],
      matchLabels: [],
    };
    existing.matchIds.push(assignment.match_id);
    if (match) {
      existing.matchLabels.push(`${match.home_team} vs ${match.away_team}`);
    }
    assignedSlotMatches.set(slotId, existing);
  }

  // Find downgrade conflicts: slots where response changes from yes/if_need_be to no
  const conflicts: ConflictInfo[] = [];

  for (const resp of newResponses) {
    if (resp.response !== "no") continue;
    if (!assignedSlotMatches.has(resp.slotId)) continue;

    const prev = currentMap.get(resp.slotId);
    if (prev === "yes" || prev === "if_need_be") {
      const slotInfo = assignedSlotMatches.get(resp.slotId)!;
      conflicts.push({
        slotId: resp.slotId,
        matchIds: slotInfo.matchIds,
        matchLabels: slotInfo.matchLabels,
        previousResponse: prev,
      });
    }
  }

  if (conflicts.length === 0) return null;

  // Get organization's lock mode
  const { data: pollData, error: pollErr } = await serviceClient
    .from("polls")
    .select("organization_id")
    .eq("id", pollId)
    .single();

  if (pollErr || !pollData) throw new Error("Failed to load poll data");

  const { data: settings } = await serviceClient
    .from("organization_settings")
    .select("availability_lock_mode")
    .eq("organization_id", pollData.organization_id)
    .maybeSingle();

  const lockMode: AvailabilityLockMode = isAvailabilityLockMode(
    settings?.availability_lock_mode,
  )
    ? settings.availability_lock_mode
    : "warn";

  const outcome = lockMode === "lock" ? "blocked" : "confirmed";

  // Log override entries for audit trail (both modes)
  const overrideRows = conflicts.flatMap((conflict) =>
    conflict.matchIds.map((matchId) => ({
      poll_id: pollId,
      umpire_id: umpireId,
      slot_id: conflict.slotId,
      match_id: matchId,
      previous_response: conflict.previousResponse,
      new_response: "no",
      policy: lockMode,
      outcome,
      organization_id: pollData.organization_id,
    })),
  );

  const { error: insertErr } = await serviceClient
    .from("availability_override_logs")
    .insert(overrideRows);

  if (insertErr) throw new Error("Failed to log availability override");

  return {
    lockMode,
    conflicts,
    organizationId: pollData.organization_id,
  };
}
