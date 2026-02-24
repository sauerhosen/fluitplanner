"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  Poll,
  PollSlot,
  Umpire,
  AvailabilityResponse,
  Match,
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
  response: "yes" | "if_need_be" | "no" | null;
};

export type SubmitResponsesResult =
  | { status: "saved"; warningLogged?: boolean }
  | { status: "confirm_required"; affectedSlots: string[] }
  | { status: "partial_saved"; blockedSlots: string[] };

export type AvailabilityGuardPolicy = "warn" | "block";

export type AvailabilityGuardStatus = {
  policy: AvailabilityGuardPolicy;
  assignedSlotIds: string[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isDowngradeTransition(
  from: AvailabilityResponse["response"] | null,
  to: ResponseInput["response"],
): boolean {
  return (
    (from === "yes" || from === "if_need_be") && (to === "no" || to === null)
  );
}

async function getGuardPolicyForOrganization(
  organizationId: string,
): Promise<AvailabilityGuardPolicy> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("organization_settings")
    .select("availability_guard_policy")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.availability_guard_policy ?? "warn") as AvailabilityGuardPolicy;
}

async function getAssignedSlotIds(
  pollId: string,
  umpireId: string,
): Promise<Set<string>> {
  const serviceClient = createServiceClient();

  const { data: assignments, error: assignmentError } = await serviceClient
    .from("assignments")
    .select("match_id")
    .eq("poll_id", pollId)
    .eq("umpire_id", umpireId);

  if (assignmentError) throw new Error(assignmentError.message);

  const matchIds = (assignments ?? []).map(
    (a: { match_id: string }) => a.match_id,
  );
  if (matchIds.length === 0) return new Set<string>();

  const { data: matches, error: matchError } = await serviceClient
    .from("matches")
    .select(
      "id, date, start_time, home_team, away_team, competition, venue, field, required_level, created_by, created_at, organization_id",
    )
    .in("id", matchIds);

  if (matchError) throw new Error(matchError.message);

  const { data: slots, error: slotError } = await serviceClient
    .from("poll_slots")
    .select("id, poll_id, start_time, end_time")
    .eq("poll_id", pollId);

  if (slotError) throw new Error(slotError.message);

  const slotMap = mapMatchesToSlots(
    (matches ?? []) as Match[],
    (slots ?? []) as PollSlot[],
  );

  const assignedSlotIds = new Set<string>();
  for (const matchId of matchIds) {
    const slotId = slotMap.get(matchId);
    if (slotId) assignedSlotIds.add(slotId);
  }

  return assignedSlotIds;
}

async function logAvailabilityWarnings(params: {
  organizationId: string;
  pollId: string;
  umpireId: string;
  policy: AvailabilityGuardPolicy;
  outcome: "confirm_required" | "blocked";
  transitions: Array<{
    slotId: string;
    from: "yes" | "if_need_be";
    to: "no" | null;
  }>;
}): Promise<void> {
  if (params.transitions.length === 0) return;

  const serviceClient = createServiceClient();
  const rows = params.transitions.map((t) => ({
    organization_id: params.organizationId,
    poll_id: params.pollId,
    slot_id: t.slotId,
    umpire_id: params.umpireId,
    from_response: t.from,
    to_response: t.to === null ? "none" : "no",
    policy: params.policy,
    outcome: params.outcome,
  }));

  const { error } = await serviceClient
    .from("availability_change_warnings")
    .insert(rows);

  if (error) throw new Error(error.message);
}

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

export async function getAvailabilityGuardStatus(
  pollId: string,
  umpireId: string,
): Promise<AvailabilityGuardStatus> {
  const supabase = await createClient();

  const { data: poll, error } = await supabase
    .from("polls")
    .select("organization_id")
    .eq("id", pollId)
    .single();

  if (error || !poll) {
    return {
      policy: "warn",
      assignedSlotIds: [],
    };
  }

  const [policy, assignedSlotIds] = await Promise.all([
    getGuardPolicyForOrganization(poll.organization_id),
    getAssignedSlotIds(pollId, umpireId),
  ]);

  return {
    policy,
    assignedSlotIds: Array.from(assignedSlotIds),
  };
}

/* ------------------------------------------------------------------ */
/*  submitResponses                                                    */
/* ------------------------------------------------------------------ */

export async function submitResponses(
  pollId: string,
  umpireId: string,
  participantName: string,
  responses: ResponseInput[],
  options?: { confirmAssignedDowngrade?: boolean },
): Promise<SubmitResponsesResult> {
  const supabase = await createClient();

  // Verify poll is open and get organization scope
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("status, organization_id")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) throw new Error("Poll not found");
  if (poll.status === "closed") throw new Error("Poll is closed");

  if (responses.length === 0) return { status: "saved" };

  const dedupedResponses = new Map<string, ResponseInput["response"]>();
  for (const response of responses) {
    dedupedResponses.set(response.slotId, response.response);
  }

  const submittedSlotIds = Array.from(dedupedResponses.keys());

  const [existingResponseRows, policy, assignedSlotIds] = await Promise.all([
    supabase
      .from("availability_responses")
      .select("slot_id, response")
      .eq("poll_id", pollId)
      .eq("umpire_id", umpireId)
      .in("slot_id", submittedSlotIds),
    getGuardPolicyForOrganization(poll.organization_id),
    getAssignedSlotIds(pollId, umpireId),
  ]);

  if (existingResponseRows.error) {
    throw new Error(existingResponseRows.error.message);
  }

  const existingBySlot = new Map<string, AvailabilityResponse["response"]>();
  for (const row of existingResponseRows.data ?? []) {
    existingBySlot.set(
      row.slot_id,
      row.response as AvailabilityResponse["response"],
    );
  }

  const conflictingTransitions: Array<{
    slotId: string;
    from: "yes" | "if_need_be";
    to: "no" | null;
  }> = [];

  for (const [slotId, next] of dedupedResponses) {
    const prev = existingBySlot.get(slotId) ?? null;
    if (!assignedSlotIds.has(slotId)) continue;

    if (isDowngradeTransition(prev, next)) {
      conflictingTransitions.push({
        slotId,
        from: prev as "yes" | "if_need_be",
        to: next as "no" | null,
      });
    }
  }

  if (
    policy === "warn" &&
    conflictingTransitions.length > 0 &&
    !options?.confirmAssignedDowngrade
  ) {
    await logAvailabilityWarnings({
      organizationId: poll.organization_id,
      pollId,
      umpireId,
      policy,
      outcome: "confirm_required",
      transitions: conflictingTransitions,
    });

    return {
      status: "confirm_required",
      affectedSlots: [...new Set(conflictingTransitions.map((t) => t.slotId))],
    };
  }

  const blockedSlotIds =
    policy === "block"
      ? new Set(conflictingTransitions.map((transition) => transition.slotId))
      : new Set<string>();

  const upsertRows: Array<{
    poll_id: string;
    slot_id: string;
    participant_name: string;
    response: "yes" | "if_need_be" | "no";
    umpire_id: string;
    updated_at: string;
  }> = [];

  const deleteSlotIds: string[] = [];

  for (const [slotId, response] of dedupedResponses) {
    if (blockedSlotIds.has(slotId)) continue;

    if (response === null) {
      deleteSlotIds.push(slotId);
      continue;
    }

    upsertRows.push({
      poll_id: pollId,
      slot_id: slotId,
      participant_name: participantName,
      response,
      umpire_id: umpireId,
      updated_at: new Date().toISOString(),
    });
  }

  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("availability_responses")
      .upsert(upsertRows, { onConflict: "poll_id,slot_id,umpire_id" });

    if (error) throw new Error(error.message);
  }

  if (deleteSlotIds.length > 0) {
    const { error } = await supabase
      .from("availability_responses")
      .delete()
      .eq("poll_id", pollId)
      .eq("umpire_id", umpireId)
      .in("slot_id", deleteSlotIds);

    if (error) throw new Error(error.message);
  }

  if (policy === "block" && conflictingTransitions.length > 0) {
    await logAvailabilityWarnings({
      organizationId: poll.organization_id,
      pollId,
      umpireId,
      policy,
      outcome: "blocked",
      transitions: conflictingTransitions,
    });

    return {
      status: "partial_saved",
      blockedSlots: Array.from(blockedSlotIds),
    };
  }

  return { status: "saved" };
}
