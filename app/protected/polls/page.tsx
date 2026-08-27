import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getPolls } from "@/lib/actions/polls";
import { PollsPageClient } from "@/components/polls/polls-page-client";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

async function PollsLoader() {
  const polls = await getPolls();
  return <PollsPageClient initialPolls={polls} />;
}

export default async function PollsPage() {
  const t = await getTranslations("polls");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">{t("pageTitle")}</h1>
        }
        actions={
          <Button asChild size="sm">
            <Link href="/protected/polls/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("newPoll")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <PollsLoader />
      </Suspense>
    </div>
  );
}
