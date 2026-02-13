import { getRecentActivity } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export async function RecentActivitySection() {
  const events = await getRecentActivity();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm py-2">
            No recent activity.
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
