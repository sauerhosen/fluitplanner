import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getMatches } from "@/lib/actions/matches";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { getPollOptions } from "@/lib/actions/polls";
import { getTrackedTeams } from "@/lib/actions/hockey-teams";
import { getSyncState } from "@/lib/actions/hockey-sync";
import { isPlannerRole } from "@/lib/actions/organization-settings";
import { MatchesPageClient } from "@/components/matches/matches-page-client";
import { getTranslations } from "next-intl/server";
import { addMonths, format } from "date-fns";

async function MatchesLoader() {
  const today = new Date();
  const twoMonthsAhead = addMonths(today, 2);

  const [matches, managedTeams, polls, trackedTeams, syncState, canSync] =
    await Promise.all([
      getMatches({
        dateFrom: format(today, "yyyy-MM-dd"),
        dateTo: format(twoMonthsAhead, "yyyy-MM-dd"),
      }),
      getManagedTeams(),
      getPollOptions(),
      getTrackedTeams(),
      getSyncState(),
      isPlannerRole(),
    ]);

  return (
    <MatchesPageClient
      initialMatches={matches}
      managedTeams={managedTeams}
      polls={polls}
      syncState={syncState}
      showSync={canSync && trackedTeams.length > 0}
    />
  );
}

export default async function MatchesPage() {
  const t = await getTranslations("matches");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <MatchesLoader />
      </Suspense>
    </div>
  );
}
