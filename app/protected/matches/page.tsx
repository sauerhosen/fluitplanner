import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getMatches } from "@/lib/actions/matches";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { MatchesPageClient } from "@/components/matches/matches-page-client";
import { getTranslations } from "next-intl/server";

async function MatchesLoader() {
  const [matches, managedTeams] = await Promise.all([
    getMatches(),
    getManagedTeams(),
  ]);

  return (
    <MatchesPageClient initialMatches={matches} managedTeams={managedTeams} />
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
