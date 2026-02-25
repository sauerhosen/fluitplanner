import { getRecentActivity, type ActivityEvent } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
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
    case "availability_override":
      return t("activityAvailabilityOverride", {
        umpire: event.umpire,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
      });
  }
}

function isOverrideEvent(event: ActivityEvent): boolean {
  return event.type === "availability_override";
}

function getEventKey(event: ActivityEvent): string {
  switch (event.type) {
    case "response":
      return `response:${event.timestamp}:${event.participant}:${event.pollTitle}`;
    case "assignment":
      return `assignment:${event.timestamp}:${event.umpire}:${event.homeTeam}:${event.awayTeam}`;
    case "assignments_batch":
      return `assignments_batch:${event.timestamp}:${event.count}`;
    case "match_added":
      return `match_added:${event.timestamp}:${event.homeTeam}:${event.awayTeam}`;
    case "matches_batch":
      return `matches_batch:${event.timestamp}:${event.count}`;
    case "availability_override":
      return `availability_override:${event.timestamp}:${event.umpire}:${event.homeTeam}:${event.awayTeam}`;
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
            {events.map((event) => (
              <li
                key={getEventKey(event)}
                className={`flex items-center justify-between text-sm ${isOverrideEvent(event) ? "text-orange-600 dark:text-orange-400 font-medium" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  {isOverrideEvent(event) && (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  {formatEvent(event, t)}
                </span>
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
