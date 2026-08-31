import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import {
  getOrganizationSettings,
  isPlannerRole,
} from "@/lib/actions/organization-settings";
import { ManagedTeamsList } from "@/components/settings/managed-teams-list";
import { AvailabilityLockSetting } from "@/components/settings/availability-lock-setting";
import { HockeySyncSettings } from "@/components/settings/hockey-sync-settings";
import { getTrackedTeams } from "@/lib/actions/hockey-teams";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { McpTokenSettings } from "@/components/settings/mcp-token-settings";
import { getMcpTokens } from "@/lib/actions/mcp-tokens";

async function ManagedTeamsLoader() {
  const teams = await getManagedTeams();
  return <ManagedTeamsList initialTeams={teams} />;
}

async function HockeySyncLoader() {
  const [teams, canEdit] = await Promise.all([
    getTrackedTeams(),
    isPlannerRole(),
  ]);
  return <HockeySyncSettings initialTeams={teams} canEdit={canEdit} />;
}

async function McpTokenLoader() {
  const canEdit = await isPlannerRole();
  const tokens = canEdit ? await getMcpTokens() : [];
  const endpointUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/mcp`;
  return (
    <McpTokenSettings
      initialTokens={tokens}
      canEdit={canEdit}
      endpointUrl={endpointUrl}
    />
  );
}

async function AvailabilityLockLoader() {
  const [settings, canEdit] = await Promise.all([
    getOrganizationSettings(),
    isPlannerRole(),
  ]);
  return (
    <AvailabilityLockSetting
      initialMode={settings.availability_lock_mode}
      canEdit={canEdit}
    />
  );
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">{t("pageTitle")}</h1>
        }
      />
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("managedTeams")}</h2>
        <Suspense fallback={<TableSkeleton rows={3} cols={3} />}>
          <ManagedTeamsLoader />
        </Suspense>
      </div>
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("hockeySyncTitle")}</h2>
        <Suspense
          fallback={<div className="bg-muted h-24 animate-pulse rounded-md" />}
        >
          <HockeySyncLoader />
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
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("mcpTitle")}</h2>
        <Suspense
          fallback={<div className="bg-muted h-24 animate-pulse rounded-md" />}
        >
          <McpTokenLoader />
        </Suspense>
      </div>
    </div>
  );
}
