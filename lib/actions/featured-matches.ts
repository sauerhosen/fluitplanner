"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Why a toggle was refused.
 *
 * Returned rather than thrown: Next.js replaces an uncaught Server Action
 * error with a generic message before it reaches the browser, so a thrown
 * reason never survives to the planner. A returned code does, and lets the
 * client render it in the planner's own language.
 */
export type FeatureRefusal = "no_kickoff" | "not_in_poll" | "match_not_found";

export type SetFeaturedResult =
  { ok: true } | { ok: false; reason: FeatureRefusal };

export type SetFeaturedDefaultResult =
  | {
      ok: true;
      featured: boolean;
      /** Open polls this retroactively changed — the public blast radius. */
      openPollsUpdated: number;
    }
  | { ok: false; reason: FeatureRefusal };

/**
 * Featuring a match with no kick-off time would be a silent no-op: slot
 * mapping keys off the kick-off, so such a match belongs to no slot and has
 * nowhere on the public page to appear.
 */
async function checkFeaturable(
  supabase: SupabaseClient,
  tenantId: string,
  matchId: string,
): Promise<FeatureRefusal | null> {
  const { data: match, error } = await supabase
    .from("matches")
    .select("start_time")
    .eq("id", matchId)
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!match) return "match_not_found";
  if (!match.start_time) return "no_kickoff";
  return null;
}

/**
 * Reveal or hide one match's details inside one poll.
 *
 * This publishes: once featured, the home and away team names are visible to
 * anyone holding the poll link, with no login.
 */
export async function setPollMatchFeatured(
  pollId: string,
  matchId: string,
  featured: boolean,
): Promise<SetFeaturedResult> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (pollError) throw new Error(pollError.message);
  if (!poll) return { ok: false, reason: "not_in_poll" };

  if (featured) {
    const refusal = await checkFeaturable(supabase, tenantId, matchId);
    if (refusal) return { ok: false, reason: refusal };
  }

  // Read the changed rows back rather than trusting a bare ok. An update
  // blocked by RLS, or aimed at a match that is not in this poll, matches no
  // rows and still reports success — which would leave the UI claiming a
  // visibility the database never accepted.
  const { data, error } = await supabase
    .from("poll_matches")
    .update({ featured })
    .eq("poll_id", pollId)
    .eq("match_id", matchId)
    .select("match_id");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { ok: false, reason: "not_in_poll" };

  revalidatePath("/protected/polls");
  return { ok: true };
}

/**
 * Set the match-level default, which seeds `poll_matches.featured` whenever
 * the match joins a poll, and apply it retroactively to open polls that
 * already contain the match.
 *
 * The retroactive part changes what is public on links umpires may already
 * hold, so the count of affected polls is returned for the caller to report
 * rather than being applied silently.
 */
export async function setMatchFeaturedByDefault(
  matchId: string,
  featured: boolean,
): Promise<SetFeaturedDefaultResult> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  if (featured) {
    const refusal = await checkFeaturable(supabase, tenantId, matchId);
    if (refusal) return { ok: false, reason: refusal };
  }

  // Closed polls are left alone: they cannot be answered, so changing what
  // they reveal has no purpose and would rewrite history.
  const { data: openPollMatches, error: pmError } = await supabase
    .from("poll_matches")
    .select("poll_id, featured, polls!inner(status, organization_id)")
    .eq("match_id", matchId)
    .eq("polls.status", "open")
    .eq("polls.organization_id", tenantId);

  if (pmError) throw new Error(pmError.message);

  const pollIdsToUpdate = (openPollMatches ?? [])
    .filter((pm: { featured: boolean }) => pm.featured !== featured)
    .map((pm: { poll_id: string }) => pm.poll_id);

  // Publish to the polls before recording the default. Neither write can be
  // rolled back from here, so the order picks which half survives a failure:
  // this way a failed propagation leaves nothing changed and a retry is
  // clean, rather than persisting a default that would silently seed every
  // future poll while the planner was told it had failed.
  if (pollIdsToUpdate.length > 0) {
    const { data: updated, error: updateError } = await supabase
      .from("poll_matches")
      .update({ featured })
      .eq("match_id", matchId)
      .in("poll_id", pollIdsToUpdate)
      .select("poll_id");

    if (updateError) throw new Error(updateError.message);
    if ((updated ?? []).length !== pollIdsToUpdate.length) {
      throw new Error(
        `Changed ${(updated ?? []).length} of ${pollIdsToUpdate.length} open polls; the match default was not recorded. Re-open the polls to see their current state.`,
      );
    }
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .update({ featured_by_default: featured })
    .eq("id", matchId)
    .eq("organization_id", tenantId)
    .select("id");

  if (matchError) throw new Error(matchError.message);
  if (!match || match.length === 0) {
    return { ok: false, reason: "match_not_found" };
  }

  revalidatePath("/protected/matches");
  revalidatePath("/protected/polls");

  return { ok: true, featured, openPollsUpdated: pollIdsToUpdate.length };
}
