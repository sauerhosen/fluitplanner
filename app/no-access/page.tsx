import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NoAccessPage() {
  const t = await getTranslations("noAccess");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        <div className="flex gap-4 justify-center">
          <Button asChild variant="outline">
            <Link href="/">{t("goHome")}</Link>
          </Button>
          <Button asChild>
            <Link href="/auth/login">{t("signIn")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
