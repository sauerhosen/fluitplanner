"use server";

import { revalidatePath } from "next/cache";
import { requirePlanner } from "@/lib/auth";
import { isValidDay } from "@/lib/domain/closed-days";

export type SetDayClosedResult =
  { ok: true } | { ok: false; reason: "not_found" };

/**
 * Close or reopen one day of a poll.
 *
 * A closed day stays on the public poll page, greyed out, but its slots take
 * no more answers. Answers already given stay, for umpire and planner alike.
 * Both directions are idempotent: closing a closed day or reopening an open
 * one is a no-op.
 *
 * @param day - Europe/Amsterdam calendar date, "YYYY-MM-DD"
 */
export async function setPollDayClosed(
  pollId: string,
  day: string,
  closed: boolean,
): Promise<SetDayClosedResult> {
  if (!isValidDay(day)) throw new Error("Invalid day");

  const { supabase, tenantId } = await requirePlanner();

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (pollError) throw new Error(pollError.message);
  if (!poll) return { ok: false, reason: "not_found" };

  const { error } = closed
    ? await supabase
        .from("poll_closed_days")
        .upsert(
          { poll_id: pollId, day },
          { onConflict: "poll_id,day", ignoreDuplicates: true },
        )
    : await supabase
        .from("poll_closed_days")
        .delete()
        .eq("poll_id", pollId)
        .eq("day", day);

  if (error) throw new Error(error.message);

  revalidatePath("/protected/polls");
  return { ok: true };
}
