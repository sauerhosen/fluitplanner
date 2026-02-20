import { getRecentActivity, type ActivityEvent } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { getTranslations, getLocale } from "next-intl/server";

function formatEvent(
  event: ActivityEvent,
  t: Awaited<ReturnType<typeof getTranslations<"dashboard">>>,
): string {
  switch (event.type) {
    case "response":
      return t("activityResponse", {
        participant: event.participant,
        pollTitle: event.pollTitle,
      });
    case "assignment":
      return t("activityAssignment", {
        umpire: event.umpire,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
      });
    case "assignments_batch":
      return t("activityAssignmentsBatch", { count: event.count });
    case "match_added":
      return t("activityMatchAdded", {
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
      });
    case "matches_batch":
      return t("activityMatchesBatch", { count: event.count });
  }
}

export async function RecentActivitySection() {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const events = await getRecentActivity();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("recentActivity")}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm py-2">
            {t("noRecentActivity")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{formatEvent(event, t)}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap ml-4">
                  {formatDistanceToNow(new Date(event.timestamp), {
                    addSuffix: true,
                    locale: locale === "nl" ? nl : undefined,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
