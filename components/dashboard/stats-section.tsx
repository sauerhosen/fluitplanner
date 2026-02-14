import Link from "next/link";
import { getDashboardStats } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function StatsSection() {
  const stats = await getDashboardStats();

  const items = [
    {
      label: "Upcoming matches",
      value: stats.upcomingMatches,
      href: "/protected/matches",
    },
    { label: "Open polls", value: stats.openPolls, href: "/protected/polls" },
    {
      label: "Unassigned",
      value: stats.unassignedMatches,
      href: "/protected/matches",
    },
    {
      label: "Active umpires",
      value: stats.activeUmpires,
      href: "/protected/umpires",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <Link key={item.label} href={item.href}>
          <Card className="cursor-pointer transition-colors hover:border-foreground/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{item.value}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
