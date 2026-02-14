import { Suspense } from "react";
import { getPollByToken } from "@/lib/actions/public-polls";
import { PollResponsePage } from "@/components/poll-response/poll-response-page";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ verify?: string }>;
};

async function PollLoader({ params, searchParams }: Props) {
  const { token } = await params;
  const { verify } = await searchParams;
  const data = await getPollByToken(token);
  const t = await getTranslations("pollResponse");

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("pollNotFoundTitle")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("pollNotFoundDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg p-4">
      <PollResponsePage
        poll={data.poll}
        slots={data.slots}
        pollToken={token}
        verifyToken={verify}
      />
    </div>
  );
}

export default async function PublicPollPage({ params, searchParams }: Props) {
  const t = await getTranslations("pollResponse");
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex min-h-screen items-center justify-center p-4">
          {t("loadingPoll")}
        </div>
      }
    >
      <PollLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}
