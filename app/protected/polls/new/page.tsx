import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAvailableMatches } from "@/lib/actions/polls";
import { getMembershipRole } from "@/lib/auth";
import { PollForm } from "@/components/polls/poll-form";
import { getTranslations } from "next-intl/server";

async function PollFormLoader() {
  const matches = await getAvailableMatches();
  return <PollForm availableMatches={matches} />;
}

export default async function NewPollPage() {
  // The create form is for planners; a viewer who lands here (an old link,
  // a typed URL) goes back to the list rather than a form that cannot submit.
  if ((await getMembershipRole()) !== "planner") {
    redirect("/protected/polls");
  }

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
