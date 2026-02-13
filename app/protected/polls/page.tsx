import { Suspense } from "react";
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
      <Suspense
        fallback={<div className="text-muted-foreground">Loading polls...</div>}
      >
        <PollsLoader />
      </Suspense>
    </div>
  );
}
