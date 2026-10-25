"use server";

import { requireMember, requirePlanner } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ClubFeedError,
  resolveClubFeed,
  type ClubFeedErrorCode,
} from "@/lib/club-feed/fetch";
import type { ClubFeed } from "@/lib/types/domain";

/** At most this many club websites per club — most need one, a few two. */
const MAX_FEEDS_PER_ORG = 5;

/**
 * Failures are returned, not thrown: Next.js replaces thrown server-action
 * messages with a generic digest in production.
 */
export type AddClubFeedResult =
  | { status: "added"; feed: ClubFeed }
  | { status: ClubFeedErrorCode | "duplicate" | "limit" };

export async function getClubFeeds(): Promise<ClubFeed[]> {
  const { supabase, tenantId } = await requireMember();

  const { data, error } = await supabase
    .from("club_feeds")
    .select("*")
    .eq("organization_id", tenantId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ClubFeed[];
}

export async function addClubFeed(url: string): Promise<AddClubFeedResult> {
  const { user, tenantId } = await requirePlanner();
  const service = createServiceClient();

  const { count, error: countError } = await service
    .from("club_feeds")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenantId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_FEEDS_PER_ORG) return { status: "limit" };

  let location;
  try {
    location = await resolveClubFeed(url);
  } catch (error) {
    if (error instanceof ClubFeedError) return { status: error.code };
    throw error;
  }

  const { data, error } = await service
    .from("club_feeds")
    .insert({
      organization_id: tenantId,
      host: location.host,
      site_alias: location.siteAlias,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) {
    // unique (organization_id, host)
    if (error.code === "23505") return { status: "duplicate" };
    throw new Error(error.message);
  }
  return { status: "added", feed: data as ClubFeed };
}

export async function removeClubFeed(feedId: string): Promise<void> {
  const { tenantId } = await requirePlanner();

  // Its snapshot and team mappings cascade with it.
  const { error } = await createServiceClient()
    .from("club_feeds")
    .delete()
    .eq("id", feedId)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
}
