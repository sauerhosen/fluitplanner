import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getMatches } from "@/lib/actions/matches";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { MatchesPageClient } from "@/components/matches/matches-page-client";

async function MatchesLoader() {
  const [matches, managedTeams] = await Promise.all([
    getMatches(),
    getManagedTeams(),
  ]);

  return (
    <MatchesPageClient initialMatches={matches} managedTeams={managedTeams} />
  );
}

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Matches</h1>
        <p className="text-muted-foreground">
          Upload match schedules and manage individual matches.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <MatchesLoader />
      </Suspense>
    </div>
  );
}
