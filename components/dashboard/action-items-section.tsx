import { getActionItems } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function ActionItemsSection() {
  const t = await getTranslations("dashboard");
  const items = await getActionItems();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("needsAttention")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{t("allCaughtUp")}</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li key={i}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-md p-2 hover:bg-accent transition-colors"
                >
                  <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
