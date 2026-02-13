import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { ManagedTeamsList } from "@/components/settings/managed-teams-list";

async function ManagedTeamsLoader() {
  const teams = await getManagedTeams();
  return <ManagedTeamsList initialTeams={teams} />;
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure which teams you manage. Only matches for these teams will be
          imported from uploaded schedules.
        </p>
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-4">Managed Teams</h2>
        <Suspense fallback={<TableSkeleton rows={3} cols={3} />}>
          <ManagedTeamsLoader />
        </Suspense>
      </div>
    </div>
  );
}
