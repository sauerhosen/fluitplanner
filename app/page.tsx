import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export default async function Home() {
  const t = await getTranslations("landing");
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6">
      <div className="absolute right-4 top-4">
        <ThemeSwitcher />
      </div>

      <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-lg">{t("subtitle")}</p>
        </div>

        <div className="w-full pt-4 [&>div]:flex-col [&>div]:w-full [&_a]:w-full [&_a]:justify-center">
          <Suspense>
            <AuthButton showDashboardLink />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
