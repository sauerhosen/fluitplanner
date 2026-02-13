import { Suspense } from "react";
import { PollDetailSkeleton } from "@/components/skeletons";
import { notFound } from "next/navigation";
import { getPoll, getAvailableMatches } from "@/lib/actions/polls";
import { getUmpiresForPoll } from "@/lib/actions/assignments";
import { PollDetailClient } from "@/components/polls/poll-detail-client";

async function PollDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const [poll, availableMatches, umpires] = await Promise.all([
      getPoll(id),
      getAvailableMatches(id),
      getUmpiresForPoll(id),
    ]);
    return (
      <PollDetailClient
        initialPoll={poll}
        availableMatches={availableMatches}
        umpires={umpires}
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
    <Suspense fallback={<PollDetailSkeleton />}>
      <PollDetailLoader params={params} />
    </Suspense>
  );
}
