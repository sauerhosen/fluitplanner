import { NextResponse } from "next/server";
import { createHockeyDeps } from "@/lib/hockey/deps";
import { refreshOrganization } from "@/lib/hockey/refresh";

export const maxDuration = 300;

/** Orgs fully synced within this window (e.g. manually) skip the full sync. */
const SKIP_IF_SYNCED_WITHIN_MS = 6 * 60 * 60 * 1000;

/**
 * How far into the run the Match Center client may still wait out rate limits
 * (about five requests a minute; a club with a dozen teams needs a few
 * windows), and after which no further org is started. The last minute of
 * maxDuration stays free for the request and writes already under way.
 */
const RUN_DEADLINE_MS = 240_000;

/** PostgREST caps responses at 1000 rows — page to see every org. */
const ORG_PAGE_SIZE = 1000;

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

  const deadline = Date.now() + RUN_DEADLINE_MS;
  const deps = createHockeyDeps({ rateLimitDeadline: deadline });
  const { supabase } = deps;

  const organizationIds = new Set<string>();
  for (let from = 0; ; from += ORG_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tracked_teams")
      .select("organization_id")
      .order("id")
      .range(from, from + ORG_PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const row of data ?? []) {
      organizationIds.add(row.organization_id as string);
    }
    if (!data || data.length < ORG_PAGE_SIZE) break;
  }

  // Orgs whose last run failed or was partial first, then stalest first. A
  // run cut short by the deadline leaves its remaining orgs unsynced, so they
  // are stalest next time; but a run cut short by throttling still writes
  // last_synced_at for the orgs it reached, and only their status tells that
  // they lost out. Either way the losers lead the next run instead of being
  // starved behind the same predecessors every day.
  const lastSyncedByOrg = new Map<string, string | null>();
  const lastFailedByOrg = new Map<string, boolean>();
  for (let from = 0; ; from += ORG_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("hockey_sync_state")
      .select("organization_id, last_synced_at, last_sync_status")
      .order("organization_id")
      .range(from, from + ORG_PAGE_SIZE - 1);
    if (error) break; // ordering is best-effort; claims still gate each org
    for (const row of data ?? []) {
      lastSyncedByOrg.set(row.organization_id as string, row.last_synced_at);
      // Anything short of success, including a row that never completed.
      lastFailedByOrg.set(
        row.organization_id as string,
        row.last_sync_status !== "success",
      );
    }
    if (!data || data.length < ORG_PAGE_SIZE) break;
  }
  const orderedOrgIds = Array.from(organizationIds).sort((a, b) => {
    // Never synced counts as failed: it has no data yet.
    const aFailed = lastFailedByOrg.get(a) ?? true;
    const bFailed = lastFailedByOrg.get(b) ?? true;
    if (aFailed !== bFailed) return aFailed ? -1 : 1;
    const aTime = lastSyncedByOrg.get(a) ?? "";
    const bTime = lastSyncedByOrg.get(b) ?? "";
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
  });

  const results: Array<Record<string, unknown>> = [];

  // Sequential on purpose: keeps upstream request volume low, and the shared
  // poule cache dedupes teams tracked by multiple orgs.
  for (const organizationId of orderedOrgIds) {
    if (Date.now() >= deadline) {
      // Left for the next run, where it sorts as stalest.
      results.push({ organizationId, skipped: true });
      continue;
    }
    try {
      // Club feeds first, then the full sync unless one ran within the skip
      // window (e.g. a manual sync).
      const result = await refreshOrganization(
        { ...deps, pause: jitterPause },
        organizationId,
        { fullSyncWindowMs: SKIP_IF_SYNCED_WITHIN_MS },
      );
      if (result.status === "busy") {
        results.push({ organizationId, skipped: true });
      } else {
        const { detector, sync } = result;
        results.push({
          organizationId,
          ...(sync ?? { skipped: true }),
          ...(detector ? { detector } : {}),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ organizationId, error: message });
    }
  }

  return NextResponse.json({ organizations: organizationIds.size, results });
}
