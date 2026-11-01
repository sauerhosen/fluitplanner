"use server";

import { revalidatePath } from "next/cache";
import { requirePlanner } from "@/lib/auth";

export type SetHiddenResult =
  { ok: true } | { ok: false; reason: "not_in_poll" };

/**
 * Hide or unhide matches inside one poll.
 *
 * Purely a planner-side declutter: a hidden match collapses out of the poll's
 * assignment grid and is left out of exports. It does not touch slots, so the
 * public poll page and every umpire's answers stay exactly as they were.
 *
 * Takes a list so a collapsed run of hidden matches can be restored in one go.
 */
export async function setPollMatchesHidden(
  pollId: string,
  matchIds: string[],
  hidden: boolean,
): Promise<SetHiddenResult> {
  if (matchIds.length === 0) return { ok: true };

  const { supabase, tenantId } = await requirePlanner();

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (pollError) throw new Error(pollError.message);
  if (!poll) return { ok: false, reason: "not_in_poll" };

  // Read the changed rows back: an update RLS blocks, or aimed at matches not
  // in this poll, matches nothing and still reports success.
  const { data, error } = await supabase
    .from("poll_matches")
    .update({ hidden })
    .eq("poll_id", pollId)
    .in("match_id", matchIds)
    .select("match_id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { ok: false, reason: "not_in_poll" };

  revalidatePath("/protected/polls");
  return { ok: true };
}
