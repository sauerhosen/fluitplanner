"use server";

import { revalidatePath } from "next/cache";
import { requireAuthContext, requirePlanner } from "@/lib/auth";
import { requireTenantId } from "@/lib/tenant";
import { createHockeyDeps } from "@/lib/hockey/deps";
import { syncWithLease, type SyncResult } from "@/lib/hockey/sync";
import type { HockeySyncState } from "@/lib/types/domain";

const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Cooldown is a returned state, not a thrown error: Next.js replaces thrown
 * server-action error messages with a generic digest in production, which
 * would break client-side sentinel matching.
 */
export type SyncNowResult =
  | ({ status: "synced" } & SyncResult)
  | {
      status: "cooldown";
    };

export async function syncNow(): Promise<SyncNowResult> {
  const { tenantId } = await requirePlanner();

  const result = await syncWithLease(
    createHockeyDeps(),
    tenantId,
    SYNC_COOLDOWN_MS,
  );
  if (result === null) {
    return { status: "cooldown" };
  }

  revalidatePath("/protected/matches");
  return { status: "synced", ...result };
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
