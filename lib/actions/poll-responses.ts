"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Ensures the request is authenticated and returns a Supabase client and the current user.
 *
 * @returns An object containing `supabase` (the Supabase client) and `user` (the authenticated user record).
 * @throws Error when no authenticated user is present ("Not authenticated").
 */
async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/**
 * Create, update, or remove an umpire's availability response for a poll slot, verify that the caller owns the poll, and revalidate the poll page.
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
  const { supabase, user } = await requireAuth();

  // Verify ownership
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id, created_by")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) return { error: "Poll not found" };
  if (poll.created_by !== user.id) return { error: "Not authorized" };

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
    // Look up umpire name for participant_name field
    const { data: umpire, error: umpireError } = await supabase
      .from("umpires")
      .select("id, name")
      .eq("id", umpireId)
      .single();

    if (umpireError || !umpire) return { error: "Umpire not found" };

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
