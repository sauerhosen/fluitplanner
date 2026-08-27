import { Suspense } from "react";
import { StatsSection } from "@/components/dashboard/stats-section";
import { ActionItemsSection } from "@/components/dashboard/action-items-section";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import {
  StatsSkeleton,
  ActionItemsSkeleton,
  ActivitySkeleton,
} from "@/components/dashboard/dashboard-skeleton";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">{t("pageTitle")}</h1>
        }
      />

      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      <Suspense fallback={<ActionItemsSkeleton />}>
        <ActionItemsSection />
      </Suspense>

      <Suspense fallback={<ActivitySkeleton />}>
        <RecentActivitySection />
      </Suspense>
    </div>
  );
}
