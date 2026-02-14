import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getPolls } from "@/lib/actions/polls";
import { PollsPageClient } from "@/components/polls/polls-page-client";
import { getTranslations } from "next-intl/server";

async function PollsLoader() {
  const polls = await getPolls();
  return <PollsPageClient initialPolls={polls} />;
}

export default async function PollsPage() {
  const t = await getTranslations("polls");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <PollsLoader />
      </Suspense>
    </div>
  );
}
