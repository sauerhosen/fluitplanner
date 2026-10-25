"use server";

import { revalidatePath } from "next/cache";
import { requireAuthContext, requirePlanner } from "@/lib/auth";
import { requireTenantId } from "@/lib/tenant";
import { createHockeyDeps } from "@/lib/hockey/deps";
import {
  MANUAL_SYNC_COOLDOWN_MS,
  refreshOrganization,
  refreshedNothing,
} from "@/lib/hockey/refresh";
import type { SyncResult } from "@/lib/hockey/sync";
import type { WatchResult } from "@/lib/club-feed/watch";
import type { HockeySyncState } from "@/lib/types/domain";

/**
 * Cooldown and busy are returned states, not thrown errors: Next.js replaces
 * thrown server-action error messages with a generic digest in production,
 * which would break client-side sentinel matching.
 *
 * `refreshed` carries the club-feed detector's result (null without feeds)
 * and the full sync's (null inside its cooldown). `cooldown` means neither
 * did anything: inside the cooldown, and no feed had a change to check or
 * an error to report.
 */
export type SyncNowResult =
  | {
      status: "refreshed";
      detector: WatchResult | null;
      sync: SyncResult | null;
    }
  | { status: "cooldown" }
  | { status: "busy" };

export async function syncNow(): Promise<SyncNowResult> {
  const { tenantId } = await requirePlanner();

  const result = await refreshOrganization(createHockeyDeps(), tenantId, {
    fullSyncWindowMs: MANUAL_SYNC_COOLDOWN_MS,
  });
  if (result.status === "busy") return { status: "busy" };
  if (refreshedNothing(result)) return { status: "cooldown" };

  revalidatePath("/protected/matches");
  return { status: "refreshed", detector: result.detector, sync: result.sync };
}

export async function getSyncState(): Promise<HockeySyncState | null> {
  const { supabase } = await requireAuthContext();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("hockey_sync_state")
    .select("*")
    .eq("organization_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function clearMatchReviewFlags(matchId: string): Promise<void> {
  const { supabase, tenantId } = await requirePlanner();

  // cancelled_upstream stays set so the match keeps its cancelled styling
  // until the planner deletes it.
  const { error } = await supabase
    .from("matches")
    .update({ needs_review: false, review_reasons: [] })
    .eq("id", matchId)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
}
