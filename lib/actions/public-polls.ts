"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import type {
  Poll,
  PollSlot,
  Umpire,
  AvailabilityResponse,
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
): Promise<Umpire | null> {
  const supabase = await createClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (!error && existing) return existing;

  // Not found — need a name to create
  if (!name) return null;

  const { data: created, error: insertError } = await supabase
    .from("umpires")
    .insert({ name: name.trim(), email: normalizedEmail, level: 1 })
    .select()
    .single();

  if (insertError || !created) return null;
  return created;
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
): Promise<void> {
  if (responses.length === 0) return;

  const supabase = await createClient();

  // Verify poll is open
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("status")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) throw new Error("Poll not found");
  if (poll.status === "closed") throw new Error("Poll is closed");

  // Upsert responses
  const rows = responses.map((r) => ({
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
