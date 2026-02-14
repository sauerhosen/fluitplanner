import { getRecentActivity } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { getTranslations } from "next-intl/server";

export async function RecentActivitySection() {
  const t = await getTranslations("dashboard");
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
                <span>{event.description}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap ml-4">
                  {formatDistanceToNow(new Date(event.timestamp), {
                    addSuffix: true,
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
