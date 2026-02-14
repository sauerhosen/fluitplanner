import Link from "next/link";
import { getDashboardStats } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";

export async function StatsSection() {
  const t = await getTranslations("dashboard");
  const stats = await getDashboardStats();

  const items = [
    {
      id: "upcomingMatches",
      label: t("upcomingMatches"),
      value: stats.upcomingMatches,
      href: "/protected/matches",
    },
    {
      id: "openPolls",
      label: t("openPolls"),
      value: stats.openPolls,
      href: "/protected/polls",
    },
    {
      id: "unassigned",
      label: t("unassigned"),
      value: stats.unassignedMatches,
      href: "/protected/matches",
    },
    {
      id: "activeUmpires",
      label: t("activeUmpires"),
      value: stats.activeUmpires,
      href: "/protected/umpires",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <Link key={item.id} href={item.href}>
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
