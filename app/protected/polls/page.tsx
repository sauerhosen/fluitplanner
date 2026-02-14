import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import { getPolls } from "@/lib/actions/polls";
import { PollsPageClient } from "@/components/polls/polls-page-client";

async function PollsLoader() {
  const polls = await getPolls();
  return <PollsPageClient initialPolls={polls} />;
}

export default function PollsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Polls</h1>
        <p className="text-muted-foreground">
          Create and manage availability polls for umpires.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <PollsLoader />
      </Suspense>
    </div>
  );
}
