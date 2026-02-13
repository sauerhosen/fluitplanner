import { Suspense } from "react";
import { getAvailableMatches } from "@/lib/actions/polls";
import { PollForm } from "@/components/polls/poll-form";

async function PollFormLoader() {
  const matches = await getAvailableMatches();
  return <PollForm availableMatches={matches} />;
}

export default function NewPollPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">New Poll</h1>
        <p className="text-muted-foreground">
          Select matches and create an availability poll.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="text-muted-foreground">Loading matches...</div>
        }
      >
        <PollFormLoader />
      </Suspense>
    </div>
  );
}
