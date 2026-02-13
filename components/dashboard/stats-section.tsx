import { getDashboardStats } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function StatsSection() {
  const stats = await getDashboardStats();

  const items = [
    { label: "Upcoming matches", value: stats.upcomingMatches },
    { label: "Open polls", value: stats.openPolls },
    { label: "Unassigned", value: stats.unassignedMatches },
    { label: "Active umpires", value: stats.activeUmpires },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
