import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPoll, getAvailableMatches } from "@/lib/actions/polls";
import { PollDetailClient } from "@/components/polls/poll-detail-client";

async function PollDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [poll, availableMatches] = await Promise.all([
      getPoll(id),
      getAvailableMatches(id),
    ]);
    return (
      <PollDetailClient
        initialPoll={poll}
        availableMatches={availableMatches}
      />
    );
  } catch {
    notFound();
  }
}

export default function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="text-muted-foreground">Loading poll...</div>}
    >
      <PollDetailLoader params={params} />
    </Suspense>
  );
}
