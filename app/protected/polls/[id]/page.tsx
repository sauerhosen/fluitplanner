import { Suspense } from "react";
import { PollDetailSkeleton } from "@/components/skeletons";
import { notFound } from "next/navigation";
import { getPoll, getAvailableMatches } from "@/lib/actions/polls";
import { getUmpiresForPoll } from "@/lib/actions/assignments";
import { PollDetailClient } from "@/components/polls/poll-detail-client";
import { getCurrentOrganizationName } from "@/lib/actions/tenant-actions";

async function PollDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [poll, availableMatches, umpires, clubName] = await Promise.all([
    getPoll(id).catch(() => null),
    getAvailableMatches(id).catch(() => []),
    getUmpiresForPoll(id).catch(() => []),
    getCurrentOrganizationName().catch(() => null),
  ]);

  if (!poll) {
    notFound();
  }

  return (
    <PollDetailClient
      initialPoll={poll}
      availableMatches={availableMatches}
      umpires={umpires}
      clubName={clubName}
    />
  );
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
