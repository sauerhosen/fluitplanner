import { Suspense } from "react";
import { getAvailableMatches } from "@/lib/actions/polls";
import { PollForm } from "@/components/polls/poll-form";
import { getTranslations } from "next-intl/server";

async function PollFormLoader() {
  const matches = await getAvailableMatches();
  return <PollForm availableMatches={matches} />;
}

export default async function NewPollPage() {
  const t = await getTranslations("polls");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("newPollTitle")}</h1>
        <p className="text-muted-foreground">{t("newPollSubtitle")}</p>
      </div>
      <Suspense
        fallback={
          <div className="text-muted-foreground">{t("loadingMatches")}</div>
        }
      >
        <PollFormLoader />
      </Suspense>
    </div>
  );
}
