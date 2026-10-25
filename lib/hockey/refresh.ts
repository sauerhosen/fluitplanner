import {
  emptyWatchResult,
  watchClubFeeds,
  type WatchDeps,
  type WatchResult,
} from "@/lib/club-feed/watch";
import {
  claimSyncSlot,
  releaseSyncSlot,
  syncOrganizationMatches,
  withinCooldown,
  type SyncResult,
} from "./sync";

/**
 * The full sync's cooldown for interactive refreshes ("sync now", MCP
 * trigger_sync). The club-feed detector still runs inside it.
 */
export const MANUAL_SYNC_COOLDOWN_MS = 15 * 60 * 1000;

export type RefreshResult =
  | { status: "busy" }
  | {
      status: "refreshed";
      /** Null when the org watches no club feeds. */
      detector: WatchResult | null;
      /** Null when the last full sync is inside `fullSyncWindowMs`. */
      sync: SyncResult | null;
    };

/**
 * Whether a refresh did nothing a caller should report: the full sync was
 * inside its window, and the detector (if any) found no change to check and
 * hit no error. Interactive triggers answer "cooldown" for it.
 */
export function refreshedNothing(
  result: Extract<RefreshResult, { status: "refreshed" }>,
): boolean {
  const { detector, sync } = result;
  return (
    sync === null &&
    (detector === null ||
      (detector.suspects === 0 && detector.errors.length === 0))
  );
}

/**
 * The one entry point for every refresh trigger (nightly cron, "sync now",
 * MCP trigger_sync): the club-feed change detector, then — outside its
 * cooldown — the full sync, under one lease so no two refreshes of an org
 * overlap.
 *
 * The detector runs first: it is cheap, and spends its Match Center budget on
 * matches that actually changed, so those land even if the full sync then
 * runs out of budget. Only the full sync advances last_synced_at — it stays
 * "last full sync", which the cron's ordering and skip window rely on.
 */
export async function refreshOrganization(
  deps: WatchDeps,
  organizationId: string,
  opts: { fullSyncWindowMs: number },
): Promise<RefreshResult> {
  // A zero window skips the cooldown but keeps the atomic lease.
  const lease = await claimSyncSlot(deps.supabase, organizationId, 0);
  if (!lease) return { status: "busy" };
  try {
    let detector: WatchResult | null;
    try {
      detector = await watchClubFeeds(deps, organizationId);
    } catch (error) {
      // A broken detector must leave today's behaviour intact: the full sync
      // still runs.
      console.error("[club-feed] detector failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      detector = { ...emptyWatchResult(), errors: [message] };
    }

    const { data: state, error } = await deps.supabase
      .from("hockey_sync_state")
      .select("last_synced_at")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const sync = withinCooldown(state?.last_synced_at, opts.fullSyncWindowMs)
      ? null
      : await syncOrganizationMatches(deps, organizationId);
    return { status: "refreshed", detector, sync };
  } finally {
    await releaseSyncSlot(deps.supabase, organizationId, lease).catch(() => {
      // lease self-expires; a failed release must not mask the run's error
    });
  }
}
