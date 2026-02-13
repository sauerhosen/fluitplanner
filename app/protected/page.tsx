import { Suspense } from "react";
import { StatsSection } from "@/components/dashboard/stats-section";
import { ActionItemsSection } from "@/components/dashboard/action-items-section";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import {
  StatsSkeleton,
  ActionItemsSkeleton,
  ActivitySkeleton,
} from "@/components/dashboard/dashboard-skeleton";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your umpire planning.
        </p>
      </div>

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
