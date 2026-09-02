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
 * Featuring a match with no kick-off time would be a silent no-op: slot
 * mapping keys off the kick-off, so such a match belongs to no slot and has
 * nowhere on the public page to appear. Refuse instead, with the reason.
 */
async function requireFeaturableMatch(
  supabase: SupabaseClient,
  tenantId: string,
  matchId: string,
): Promise<void> {
  const { data: match, error } = await supabase
    .from("matches")
    .select("start_time")
    .eq("id", matchId)
    .eq("organization_id", tenantId)
    .single();

  if (error || !match) throw new Error("Match not found");
  if (!match.start_time) {
    throw new Error(
      "This match has no kick-off time, so it is not in any slot and cannot be featured",
    );
  }
}

/**
 * Reveal or hide one match's details inside one poll.
 *
 * This publishes to an unauthenticated page: once featured, the home and away
 * team names are visible to anyone holding the poll link.
 */
export async function setPollMatchFeatured(
  pollId: string,
  matchId: string,
  featured: boolean,
): Promise<void> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id")
    .eq("id", pollId)
    .eq("organization_id", tenantId)
    .single();

  if (pollError || !poll) throw new Error("Poll not found");

  if (featured) {
    await requireFeaturableMatch(supabase, tenantId, matchId);
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
  if (!data || data.length === 0) {
    throw new Error("This match is not in this poll");
  }

  revalidatePath("/protected/polls");
}

export type FeaturedDefaultResult = {
  featured: boolean;
  /** How many already-open polls this changed — the public blast radius. */
  openPollsUpdated: number;
};

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
): Promise<FeaturedDefaultResult> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  if (featured) {
    await requireFeaturableMatch(supabase, tenantId, matchId);
  }

  const { error: matchError } = await supabase
    .from("matches")
    .update({ featured_by_default: featured })
    .eq("id", matchId)
    .eq("organization_id", tenantId);

  if (matchError) throw new Error(matchError.message);

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
        "Could not apply the change to every open poll containing this match",
      );
    }
  }

  revalidatePath("/protected/matches");
  revalidatePath("/protected/polls");

  return { featured, openPollsUpdated: pollIdsToUpdate.length };
}
