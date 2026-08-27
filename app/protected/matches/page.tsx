import { Suspense } from "react";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeletons";
import { getMatches } from "@/lib/actions/matches";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { getPollOptions } from "@/lib/actions/polls";
import { getTrackedTeams } from "@/lib/actions/hockey-teams";
import { getSyncState } from "@/lib/actions/hockey-sync";
import { isPlannerRole } from "@/lib/actions/organization-settings";
import { MatchesPageClient } from "@/components/matches/matches-page-client";
import { addMonths, format } from "date-fns";

async function MatchesLoader() {
  const today = new Date();
  const twoMonthsAhead = addMonths(today, 2);

  const [matches, managedTeams, polls, isPlanner] = await Promise.all([
    getMatches({
      dateFrom: format(today, "yyyy-MM-dd"),
      dateTo: format(twoMonthsAhead, "yyyy-MM-dd"),
    }),
    getManagedTeams(),
    getPollOptions(),
    isPlannerRole(),
  ]);

  // Sync UI is planner-only — spare everyone else the two extra queries.
  const [trackedTeams, syncState] = isPlanner
    ? await Promise.all([getTrackedTeams(), getSyncState()])
    : [[], null];

  return (
    <MatchesPageClient
      initialMatches={matches}
      managedTeams={managedTeams}
      polls={polls}
      syncState={syncState}
      showSync={isPlanner && trackedTeams.length > 0}
      isPlanner={isPlanner}
    />
  );
}

export default function MatchesPage() {
  // The header lives in the client component because its actions need client
  // state — see docs/page-chrome.md.
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <PageHeaderSkeleton />
          <TableSkeleton />
        </div>
      }
    >
      <MatchesLoader />
    </Suspense>
  );
}
