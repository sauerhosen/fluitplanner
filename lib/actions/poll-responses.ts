"use server";

import { requirePlanner } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Create, update, or remove an umpire's availability response for a poll slot, verify that the caller owns the poll and that the umpire is on the club's roster, and revalidate the poll page. The umpire need not have answered the poll themselves.
 *
 * @param pollId - The ID of the poll to modify
 * @param slotId - The ID of the poll slot being updated
 * @param umpireId - The ID of the umpire submitting the response
 * @param response - The availability response: `"yes"`, `"if_need_be"`, `"no"`, or `null` to delete an existing response
 * @returns An empty object on success, or `{ error: string }` containing an error message on failure
 */
export async function updatePollResponse(
  pollId: string,
  slotId: string,
  umpireId: string,
  response: "yes" | "if_need_be" | "no" | null,
): Promise<{ error?: string }> {
  const { supabase, tenantId } = await requirePlanner();

  // Verify ownership via organization
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id, organization_id")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .single();

  if (pollError || !poll) return { error: "Poll not found" };

  if (response === null) {
    // Delete the response
    const { error: deleteError } = await supabase
      .from("availability_responses")
      .delete()
      .eq("poll_id", pollId)
      .eq("slot_id", slotId)
      .eq("umpire_id", umpireId);

    if (deleteError) return { error: deleteError.message };
  } else {
    // A planner may answer for an umpire who never opened the poll, so the
    // umpire is not vouched for by an existing response: check the roster.
    // The slot must belong to this poll too, or the answer lands on a slot the
    // poll page never shows.
    const [slotResult, rosterResult, umpireResult] = await Promise.all([
      supabase
        .from("poll_slots")
        .select("id")
        .eq("id", slotId)
        .eq("poll_id", pollId)
        .single(),
      supabase
        .from("organization_umpires")
        .select("umpire_id")
        .eq("organization_id", tenantId)
        .eq("umpire_id", umpireId)
        .single(),
      // Look up umpire name for participant_name field
      supabase.from("umpires").select("id, name").eq("id", umpireId).single(),
    ]);

    if (slotResult.error || !slotResult.data)
      return { error: "Slot not found" };
    if (rosterResult.error || !rosterResult.data)
      return { error: "Umpire not found" };
    const umpire = umpireResult.data;
    if (umpireResult.error || !umpire) return { error: "Umpire not found" };

    const { error: upsertError } = await supabase
      .from("availability_responses")
      .upsert(
        {
          poll_id: pollId,
          slot_id: slotId,
          umpire_id: umpireId,
          participant_name: umpire.name,
          response,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "poll_id,slot_id,umpire_id" },
      );

    if (upsertError) return { error: upsertError.message };
  }

  revalidatePath(`/protected/polls/${pollId}`);
  return {};
}
