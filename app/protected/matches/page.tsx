import { Suspense } from "react";
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
      <Suspense
        fallback={
          <div className="text-muted-foreground">Loading matches...</div>
        }
      >
        <MatchesLoader />
      </Suspense>
    </div>
  );
}
