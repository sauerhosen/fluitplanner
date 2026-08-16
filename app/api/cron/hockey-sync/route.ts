import { NextResponse } from "next/server";
import { createHockeyDeps } from "@/lib/hockey/deps";
import { syncWithLease } from "@/lib/hockey/sync";

export const maxDuration = 300;

/** Orgs synced within this window (e.g. manually) are skipped. */
const SKIP_IF_SYNCED_WITHIN_MS = 6 * 60 * 60 * 1000;

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

  const deps = createHockeyDeps();
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

  const results: Array<Record<string, unknown>> = [];

  // Sequential on purpose: keeps upstream request volume low, and the shared
  // 15-minute poule cache dedupes teams tracked by multiple orgs.
  for (const organizationId of organizationIds) {
    try {
      const result = await syncWithLease(
        { ...deps, pause: jitterPause },
        organizationId,
        SKIP_IF_SYNCED_WITHIN_MS,
      );
      if (result === null) {
        results.push({ organizationId, skipped: true });
      } else {
        results.push({ organizationId, ...result });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ organizationId, error: message });
    }
  }

  return NextResponse.json({ organizations: organizationIds.size, results });
}
