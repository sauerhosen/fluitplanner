import { Suspense } from "react";
import { getPollByToken } from "@/lib/actions/public-polls";
import { PollResponsePage } from "@/components/poll-response/poll-response-page";

type Props = {
  params: Promise<{ token: string }>;
};

async function PollLoader({ params }: Props) {
  const { token } = await params;
  const data = await getPollByToken(token);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Poll not found</h1>
          <p className="text-muted-foreground mt-2">
            This poll link is invalid or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg p-4">
      <PollResponsePage poll={data.poll} slots={data.slots} />
    </div>
  );
}

export default function PublicPollPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex min-h-screen items-center justify-center p-4">
          Loading poll...
        </div>
      }
    >
      <PollLoader params={params} />
    </Suspense>
  );
}
