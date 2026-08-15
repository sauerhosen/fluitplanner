import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createHockeyClient } from "@/lib/hockey/client";
import { createDbCredentialStore } from "@/lib/hockey/credential-store";
import { syncOrganizationMatches } from "@/lib/hockey/sync";

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

  const lastSyncedByOrg = new Map<string, string | null>();
  if (organizationIds.length > 0) {
    const { data: states } = await supabase
      .from("hockey_sync_state")
      .select("organization_id, last_synced_at")
      .in("organization_id", organizationIds);
    for (const state of states ?? []) {
      lastSyncedByOrg.set(state.organization_id, state.last_synced_at);
    }
  }

  const results: Array<Record<string, unknown>> = [];

  // Sequential on purpose: keeps upstream request volume low, and the shared
  // 15-minute poule cache dedupes teams tracked by multiple orgs.
  for (const organizationId of organizationIds) {
    const lastSyncedAt = lastSyncedByOrg.get(organizationId);
    if (
      lastSyncedAt &&
      Date.now() - new Date(lastSyncedAt).getTime() < SKIP_IF_SYNCED_WITHIN_MS
    ) {
      results.push({ organizationId, skipped: true });
      continue;
    }

    try {
      const result = await syncOrganizationMatches(
        { supabase, client, pause: jitterPause },
        organizationId,
      );
      results.push({ organizationId, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ organizationId, error: message });
    }
  }

  return NextResponse.json({ organizations: organizationIds.length, results });
}
