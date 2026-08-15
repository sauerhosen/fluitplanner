import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createHockeyClient } from "@/lib/hockey/client";
import { createDbCredentialStore } from "@/lib/hockey/credential-store";
import {
  claimSyncSlot,
  releaseSyncSlot,
  syncOrganizationMatches,
} from "@/lib/hockey/sync";

export const maxDuration = 300;

/** Orgs synced within this window (e.g. manually) are skipped. */
const SKIP_IF_SYNCED_WITHIN_MS = 6 * 60 * 60 * 1000;

function jitterPause(): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, 300 + Math.random() * 500),
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const client = createHockeyClient({
    store: createDbCredentialStore(supabase),
  });

  const { data: trackedRows, error: trackedError } = await supabase
    .from("tracked_teams")
    .select("organization_id");
  if (trackedError) {
    return NextResponse.json({ error: trackedError.message }, { status: 500 });
  }
  const organizationIds = Array.from(
    new Set((trackedRows ?? []).map((row) => row.organization_id as string)),
  );

  const results: Array<Record<string, unknown>> = [];

  // Sequential on purpose: keeps upstream request volume low, and the shared
  // 15-minute poule cache dedupes teams tracked by multiple orgs.
  for (const organizationId of organizationIds) {
    try {
      // Atomic claim — fails closed on DB errors and prevents overlapping
      // runs (e.g. a manual sync racing the cron) for the same org.
      const lease = await claimSyncSlot(
        supabase,
        organizationId,
        SKIP_IF_SYNCED_WITHIN_MS,
      );
      if (!lease) {
        results.push({ organizationId, skipped: true });
        continue;
      }
      try {
        const result = await syncOrganizationMatches(
          { supabase, client, pause: jitterPause },
          organizationId,
        );
        results.push({ organizationId, ...result });
      } finally {
        await releaseSyncSlot(supabase, organizationId, lease).catch(() => {
          // lease self-expires; a failed release must not mask the sync error
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ organizationId, error: message });
    }
  }

  return NextResponse.json({ organizations: organizationIds.length, results });
}
