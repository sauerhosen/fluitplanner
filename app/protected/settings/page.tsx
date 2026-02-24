import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { ManagedTeamsList } from "@/components/settings/managed-teams-list";
import { AvailabilityGuardSettings } from "@/components/settings/availability-guard-settings";
import { getAvailabilityGuardPolicy } from "@/lib/actions/settings";
import { requireTenantId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

async function ManagedTeamsLoader() {
  const teams = await getManagedTeams();
  return <ManagedTeamsList initialTeams={teams} />;
}

async function AvailabilityGuardSettingsLoader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const tenantId = await requireTenantId();
  const [policy, membership] = await Promise.all([
    getAvailabilityGuardPolicy(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (membership.error) throw new Error(membership.error.message);

  return (
    <AvailabilityGuardSettings
      initialPolicy={policy}
      canEdit={membership.data?.role === "planner"}
    />
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
          {t("guardPolicySection")}
        </h2>
        <Suspense fallback={<TableSkeleton rows={2} cols={1} />}>
          <AvailabilityGuardSettingsLoader />
        </Suspense>
      </div>
    </div>
  );
}
