import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { getOrganizationSettings } from "@/lib/actions/organization-settings";
import { ManagedTeamsList } from "@/components/settings/managed-teams-list";
import { AvailabilityLockSetting } from "@/components/settings/availability-lock-setting";
import { getTranslations } from "next-intl/server";

async function ManagedTeamsLoader() {
  const teams = await getManagedTeams();
  return <ManagedTeamsList initialTeams={teams} />;
}

async function AvailabilityLockLoader() {
  const settings = await getOrganizationSettings();
  return (
    <AvailabilityLockSetting initialMode={settings.availability_lock_mode} />
  );
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("managedTeams")}</h2>
        <Suspense fallback={<TableSkeleton rows={3} cols={3} />}>
          <ManagedTeamsLoader />
        </Suspense>
      </div>
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          {t("availabilityLockTitle")}
        </h2>
        <Suspense
          fallback={<div className="bg-muted h-24 animate-pulse rounded-md" />}
        >
          <AvailabilityLockLoader />
        </Suspense>
      </div>
    </div>
  );
}
