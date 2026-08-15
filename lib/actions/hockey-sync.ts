"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireTenantId } from "@/lib/tenant";
import { isPlannerRole } from "@/lib/actions/organization-settings";
import { createHockeyClient } from "@/lib/hockey/client";
import { createDbCredentialStore } from "@/lib/hockey/credential-store";
import {
  claimSyncSlot,
  syncOrganizationMatches,
  type SyncResult,
} from "@/lib/hockey/sync";
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

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function syncNow(): Promise<SyncNowResult> {
  await requireAuth();
  const tenantId = await requireTenantId();
  if (!(await isPlannerRole())) throw new Error("NOT_PLANNER");

  const service = createServiceClient();

  // Atomic: concurrent callers (second tab, cron overlap) lose the claim
  // instead of running the engine twice.
  if (!(await claimSyncSlot(service, tenantId, SYNC_COOLDOWN_MS))) {
    return { status: "cooldown" };
  }

  const result = await syncOrganizationMatches(
    {
      supabase: service,
      client: createHockeyClient({ store: createDbCredentialStore(service) }),
    },
    tenantId,
  );

  revalidatePath("/protected/matches");
  return { status: "synced", ...result };
}

export async function getSyncState(): Promise<HockeySyncState | null> {
  const { supabase } = await requireAuth();
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
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();
  if (!(await isPlannerRole())) throw new Error("NOT_PLANNER");

  // cancelled_upstream stays set so the match keeps its cancelled styling
  // until the planner deletes it.
  const { error } = await supabase
    .from("matches")
    .update({ needs_review: false, review_reasons: [] })
    .eq("id", matchId)
    .eq("organization_id", tenantId);
  if (error) throw new Error(error.message);
}
